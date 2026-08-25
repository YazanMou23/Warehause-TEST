use std::collections::HashSet;
use super::types::{DiscoveredDevice, DeviceCapabilities};

/// Discover scanners and printers via Windows WIA COM and Get-Printer spooler.
/// Falls back to PowerShell for spooler queries (COM automation preferred for WIA).
pub async fn discover_via_windows_pnp(seen_ids: &mut HashSet<String>) -> Vec<DiscoveredDevice> {
    let mut devices = Vec::new();

    // WIA scanners via PowerShell (temporary — will be replaced with windows-rs COM in future)
    let wia_out = tokio::process::Command::new("powershell")
        .args([
            "-NoProfile", "-NonInteractive", "-Command",
            r#"try { $dm = New-Object -ComObject WIA.DeviceManager; foreach ($d in $dm.DeviceInfos) { $n = try { $d.Properties.Item('Name').Value } catch { 'Scanner' }; $m = try { $d.Properties.Item('Manufacturer').Value } catch { '' }; $t = try { $d.Properties.Item('Port').Value } catch { '' }; Write-Output "$($d.DeviceID)||$n||$m||$t" } } catch {}"#,
        ])
        .output()
        .await;

    if let Ok(out) = wia_out {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines().filter(|l| !l.is_empty()) {
            let parts: Vec<&str> = line.split("||").collect();
            if parts.len() < 2 { continue; }
            let dev_id   = parts[0].trim();
            let dev_name = parts.get(1).unwrap_or(&"Scanner").trim();
            let mfg      = parts.get(2).unwrap_or(&"").trim();
            let port     = parts.get(3).unwrap_or(&"").trim();

            let id_key = format!("WIA_{}", dev_id.replace(|c: char| !c.is_alphanumeric(), "_"));
            if seen_ids.contains(&id_key) { continue; }
            seen_ids.insert(id_key.clone());

            let is_usb = dev_id.to_uppercase().starts_with("USB") || port.to_uppercase().starts_with("USB");

            devices.push(DiscoveredDevice {
                id:              id_key,
                name:            dev_name.to_string(),
                display_name:    format!("{} {}", if mfg.is_empty() { "Scanner" } else { mfg }, dev_name),
                manufacturer:    if mfg.is_empty() { "Generic".into() } else { mfg.to_string() },
                model:           dev_name.to_string(),
                device_type:     "scanner".into(),
                connection_type: if is_usb { "USB".into() } else { "WIFI".into() },
                ip:              None,
                port:            None,
                protocol:        "WIA".into(),
                serial:          None,
                status:          "available".into(),
                status_details:  if is_usb { "USB-Scanner (WIA)".into() } else { "Netzwerk-Scanner (WIA)".into() },
                capabilities:    DeviceCapabilities {
                    printing: false,
                    scanning: true,
                    ..Default::default()
                },
            });
        }
    }

    // Windows Print Spooler via Get-Printer
    let ps_out = tokio::process::Command::new("powershell")
        .args([
            "-NoProfile", "-NonInteractive", "-Command",
            "try { Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json } catch {}",
        ])
        .output()
        .await;

    if let Ok(out) = ps_out {
        let stdout = String::from_utf8_lossy(&out.stdout);
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
            let arr = match &val {
                serde_json::Value::Array(a) => a.clone(),
                serde_json::Value::Object(_) => vec![val.clone()],
                _ => vec![],
            };
            for p in arr {
                let name = p["Name"].as_str().unwrap_or("").to_string();
                if name.is_empty() { continue; }
                let name_lower = name.to_lowercase();
                if name_lower.contains("pdf") || name_lower.contains("xps")
                    || name_lower.contains("onenote") || name_lower.contains("fax") { continue; }

                let port_name  = p["PortName"].as_str().unwrap_or("").to_string();
                let driver     = p["DriverName"].as_str().unwrap_or("").to_string();

                // Extract IP from port name if present
                let ip = port_name.split(',')
                    .find_map(|s| {
                        let s = s.trim();
                        if s.starts_with("192.168.") || s.starts_with("10.") || s.starts_with("172.") {
                            Some(s.to_string())
                        } else { None }
                    });

                let id_key = format!("WIN_{}", name.replace(|c: char| !c.is_alphanumeric(), "_"));
                if seen_ids.contains(&id_key) { continue; }
                seen_ids.insert(id_key.clone());

                devices.push(DiscoveredDevice {
                    id:              id_key,
                    name:            name.clone(),
                    display_name:    name.clone(),
                    manufacturer:    "Windows".into(),
                    model:           driver,
                    device_type:     "printer_scanner".into(),
                    connection_type: if ip.is_some() { "WIFI".into() } else { "USB".into() },
                    ip,
                    port:            Some(80),
                    protocol:        "WIA".into(),
                    serial:          None,
                    status:          "available".into(),
                    status_details:  "In Windows installiert".into(),
                    capabilities:    DeviceCapabilities::default(),
                });
            }
        }
    }

    devices
}
