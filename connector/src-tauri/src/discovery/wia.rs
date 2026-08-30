use std::collections::{HashMap, HashSet};
use super::types::{DiscoveredDevice, DeviceCapabilities};
use crate::bridge;

/// Discover scanners and printers on Windows via the C# WIA bridge
/// (`ScannerBridge.exe`) plus the print spooler.
///
/// The bridge enumStates WIA devices with real ADF/duplex capabilities and lets
/// us probe whether the device can actually be scanned via WIA. Devices whose
/// WIA id indicates a WSD/eSCL class (`SWD\ESCL...`) that cannot be connected
/// over WIA are routed to the eSCL backend instead of being incorrectly claimed
/// as WIA-scanable (this is the source of the "Brother ADF fails" bug).
pub async fn discover_via_windows_pnp(seen_ids: &mut HashSet<String>) -> Vec<DiscoveredDevice> {
    let mut devices = Vec::new();

    // ── 1. WIA scanners via the bridge ─────────────────────────────────────
    if let Some(path) = bridge::bridge_path() {
        log::info!("WIA bridge present at {:?}", path);
        match bridge::spawn() {
            Ok(mut session) => {
                let lines = session.command(r#"{"cmd":"discover"}"#).unwrap_or_default();
                for line in lines {
                    if let Some(arr) = line.get("devices").and_then(|v| v.as_array()) {
                        for dev in arr {
                            let raw_id = dev["id"].as_str().unwrap_or("");
                            if raw_id.is_empty() { continue; }
                            let name      = dev["name"].as_str().unwrap_or("Scanner").to_string();
                            let has_adf   = dev["hasAdf"].as_bool().unwrap_or(false);
                            let has_dup   = dev["hasDuplex"].as_bool().unwrap_or(false);
                            let has_flat  = dev["hasFlatbed"].as_bool().unwrap_or(true);

                            // eSCL-class WSD scanners (id starts with SWD\ESCL)
                            let is_escl_class = raw_id.to_uppercase().contains("ESCL")
                                || raw_id.to_uppercase().starts_with("SWD\\ESCL");

                            // Probe whether WIA can actually connect & scan this device.
                            let (wia_usable, probe_caps, probe_err) = probe_wia_capabilities(&mut session, raw_id).await;

                            let id_key = format!("WIA_{}", raw_id.replace(|c: char| !c.is_alphanumeric(), "_"));
                            if seen_ids.contains(&id_key) { continue; }
                            seen_ids.insert(id_key.clone());

                            let mut backends: Vec<String> = Vec::new();
                            if is_escl_class {
                                // WSD/eSCL scanner (e.g. Brother MFC) — always eSCL-capable
                                backends.push("ESCL".into());
                            }
                            if wia_usable {
                                // WIA genuinely works for this device (Canon MX490 etc.)
                                backends.push("WIA".into());
                            }
                            if backends.is_empty() {
                                // Fallback: treat as WIA (will surface a clear error if not)
                                backends.push("WIA".into());
                            }

                            let (adf, duplex, flatbed, status, details) = if let Some(c) = probe_caps {
                                (
                                    c.adf, c.duplex, c.flatbed,
                                    "available",
                                    "WIA-Scanner (verbunden)".to_string(),
                                )
                            } else if is_escl_class && !wia_usable {
                                (
                                    true, // eSCL classes typically have an ADF; refined when the IP is found
                                    false,
                                    true,
                                    "network_only",
                                    if let Some(e) = probe_err {
                                        format!("Netzwerk-Scanner (WIA nicht scanbar: {}) — wird über eSCL angesprochen", e)
                                    } else {
                                        "Netzwerk-Scanner — WIA nicht verbindbar, wird über eSCL angesprochen".to_string()
                                    },
                                )
                            } else {
                                (
                                    has_adf, has_dup, has_flat,
                                    "available",
                                    "WIA-Scanner".to_string(),
                                )
                            };

                            devices.push(DiscoveredDevice {
                                id:              id_key.clone(),
                                name:            name.clone(),
                                display_name:    format!("{} {}", guess_manufacturer(&name), name),
                                manufacturer:    guess_manufacturer(&name),
                                model:           name.clone(),
                                device_type:     "scanner".into(),
                                connection_type: if is_escl_class { "WIFI".into() } else { "USB".into() },
                                ip:              None,
                                port:            None,
                                protocol:        if is_escl_class { "WIA/ESCL".into() } else { "WIA".into() },
                                serial:          None,
                                status:          status.into(),
                                status_details:  details,
                                backends,
                                backend:         Some(if is_escl_class { "ESCL".into() } else { "WIA".into() }),
                                wia_id:          Some(raw_id.to_string()),
                                capabilities:    DeviceCapabilities {
                                    printing: false,
                                    scanning: true,
                                    adf,
                                    duplex,
                                    flatbed,
                                    ..Default::default()
                                },
                            });
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!("WIA bridge spawn failed: {}", e);
            }
        }
    } else {
        log::warn!("ScannerBridge.exe missing — WIA discovery skipped");
    }

    // ── 2. Windows Print Spooler via Get-Printer ───────────────────────────
    let ps_out = tokio::process::Command::new("powershell")
        .args([
            "-NoProfile", "-NonInteractive", "-Command",
            "try { Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json } catch {}",
        ])
        .output()
        .await;

    let arp = arp_table().await;

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

                let ip = resolve_printer_ip(&port_name, &arp);

                let id_key = format!("WIN_{}", name.replace(|c: char| !c.is_alphanumeric(), "_"));
                if seen_ids.contains(&id_key) { continue; }
                seen_ids.insert(id_key.clone());

                devices.push(DiscoveredDevice {
                    id:              id_key,
                    name:            name.clone(),
                    display_name:    name.clone(),
                    manufacturer:    guess_manufacturer(&name),
                    model:           driver,
                    device_type:     "printer_scanner".into(),
                    connection_type: if ip.is_some() { "WIFI".into() } else { "USB".into() },
                    ip,
                    port:            Some(80),
                    protocol:        "WIA".into(),
                    serial:          None,
                    status:          "available".into(),
                    status_details:  "In Windows installiert".into(),
                    backends:        vec!["WIA".into()],
                    backend:         Some("WIA".into()),
                    wia_id:          None,
                    capabilities:    DeviceCapabilities::default(),
                });
            }
        }
    }

    devices
}

/// Probe a WIA device's true capabilities via the bridge. Returns whether the
/// device can be connected/scanned over WIA, along with the real capabilities
/// (or an error message if connection failed).
async fn probe_wia_capabilities(
    session: &mut bridge::BridgeSession,
    raw_id: &str,
) -> (bool, Option<DeviceCapabilities>, Option<String>) {
    let cmd = serde_json::json!({ "cmd": "capabilities", "deviceId": raw_id }).to_string();
    match session.command(&cmd) {
        Ok(lines) => {
            for line in lines {
                if line.get("event").and_then(|e| e.as_str()) == Some("error") {
                    let msg = line["message"].as_str().unwrap_or("WIA-Verbindung fehlgeschlagen").to_string();
                    return (false, None, Some(msg));
                }
                if let Some(caps) = line.get("capabilities") {
                    return (
                        true,
                        Some(DeviceCapabilities {
                            printing: false,
                            scanning: true,
                            adf:      caps["hasAdf"].as_bool().unwrap_or(false),
                            duplex:   caps["hasDuplex"].as_bool().unwrap_or(false),
                            flatbed:  caps["hasFlatbed"].as_bool().unwrap_or(true),
                            ..Default::default()
                        }),
                        None,
                    );
                }
            }
            (false, None, None)
        }
        Err(e) => (false, None, Some(e)),
    }
}

fn guess_manufacturer(name: &str) -> String {
    let n = name.to_uppercase();
    if n.contains("BROTHER")  { return "Brother".into(); }
    if n.contains("CANON") || n.contains("PIXMA") { return "Canon".into(); }
    if n.contains("HP") || n.contains("HEWLETT") || n.contains("OFFICEJET")
        || n.contains("LASERJET") || n.contains("DESKJET") { return "HP".into(); }
    if n.contains("EPSON") || n.contains("ECOTANK") { return "Epson".into(); }
    if n.contains("XEROX")    { return "Xerox".into(); }
    if n.contains("KYOCERA")  { return "Kyocera".into(); }
    if n.contains("RICOH")    { return "Ricoh".into(); }
    if n.contains("LEXMARK")  { return "Lexmark".into(); }
    if n.contains("SAMSUNG")  { return "Samsung".into(); }
    "Scanner".into()
}

/// Resolve a printer's IP address from its Windows port name.
///
/// Port names come in several shapes:
///  - `IP_192.168.178.40` / bare `192.168.x.x` → literal IP
///  - `CNBJNP_9C32CE0C3246` (Canon BJNP, encoded MAC) → ARP lookup
///  - `CONN:...`, `WSD-...`, … → try to find the MAC, else `None`
fn resolve_printer_ip(port_name: &str, arp: &HashMap<String, String>) -> Option<String> {
    let pn = port_name.trim();
    if pn.is_empty() { return None; }

    // 1. Literal IP embedded in the port name.
    if let Some(ip) = pn.split([' ', ',']).find_map(|s| {
        let s = s.trim();
        if s.starts_with("192.168.") || s.starts_with("10.") || s.starts_with("172.") { Some(s.to_string()) } else { None }
    }) {
        return Some(ip);
    }

    // 2. Canon BJNP ports encode the MAC as `CNBJNP_9C32CE0C3246`.
    if let Some(hex) = pn.to_uppercase().rsplit("CNBJNP_").next() {
        if hex.len() >= 12 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
            let mac = format!(
                "{}-{}-{}-{}-{}-{}",
                &hex[0..2], &hex[2..4], &hex[4..6], &hex[6..8], &hex[8..10], &hex[10..12]
            )
            .to_lowercase();
            if let Some(ip) = arp.get(&mac) {
                log::info!("[resolve-ip] port '{}' -> CNBJNP MAC '{}' -> IP {}", pn, mac, ip);
                return Some(ip.clone());
            } else {
                log::warn!("[resolve-ip] port '{}' -> CNBJNP MAC '{}' NOT found in ARP ({} entries)", pn, mac, arp.len());
            }
        }
    }

    // 3. WSD / generic ports sometimes embed the MAC after a GUID or `CONN:`.
    let macish = pn.chars().filter(|c| c.is_ascii_hexdigit()).take(12).collect::<String>().to_uppercase();
    if macish.len() == 12 {
        let mac = format!(
            "{}-{}-{}-{}-{}-{}",
            &macish[0..2], &macish[2..4], &macish[4..6], &macish[6..8], &macish[8..10], &macish[10..12]
        )
        .to_lowercase();
        if let Some(ip) = arp.get(&mac) { return Some(ip.clone()); }
    }

    None
}

/// Collect the current ARP table as `MAC(lowercase) -> IP`.
async fn arp_table() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let out = tokio::process::Command::new("arp")
        .arg("-a")
        .output()
        .await;
    if let Ok(o) = out {
        let stdout = String::from_utf8_lossy(&o.stdout);
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let ip  = parts[0].trim();
                let mac = parts[1].trim().to_lowercase();
                if ip.starts_with("192.") || ip.starts_with("10.") || ip.starts_with("172.")
                    || ip.starts_with("169.254.") {
                    if mac.len() == 17 && mac.matches('-').count() == 5 {
                        map.insert(mac, ip.to_string());
                    }
                }
            }
        }
        log::info!("[arp-table] got {} reachable IPv4 MAC->IP entries from arp -a", map.len());
    } else {
        log::warn!("[arp-table] arp -a failed: {:?}", out.err());
    }
    map
}
