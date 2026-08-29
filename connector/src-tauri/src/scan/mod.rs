pub mod escl;
pub mod jobs;
pub mod simulator;

#[cfg(target_os = "windows")]
pub mod wia;

use serde::{Deserialize, Serialize};
use crate::{DeviceCache, discovery::types::DiscoveredDevice};
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
    /// Device identity from discovery. Preferred over `scanner_ip` when set.
    pub device_id:      Option<String>,
    pub scanner_ip:     Option<String>,
    pub scanner_port:   Option<u16>,
    pub dpi:            Option<u32>,
    pub color_mode:     Option<String>,  // "Color" | "Grayscale" | "BlackAndWhite"
    pub input_source:   Option<String>,  // "Platen" | "Feeder" | "FeederDuplex" | "auto"
    pub source:         Option<String>,  // "auto" | "adf" | "flatbed"
    pub format:         Option<String>,  // "jpeg" | "png"
    pub batch_scan:     Option<bool>,
    pub duplex:         Option<bool>,
    pub multi_page:     Option<bool>,
    pub page_count:     Option<u32>,
}

impl ScanOptions {
    pub fn source(&self) -> String {
        self.source.clone()
            .or_else(|| match self.input_source.as_deref() {
                Some("Platen") => Some("flatbed".to_string()),
                Some("Feeder") => Some("adf".to_string()),
                Some("FeederDuplex") => Some("adf".to_string()),
                _ => None,
            })
            .unwrap_or_else(|| "auto".to_string())
    }

    pub fn duplex(&self) -> bool {
        self.duplex.unwrap_or(false)
            || self.input_source.as_deref() == Some("FeederDuplex")
    }

    pub fn batch(&self) -> bool {
        let src = self.source();
        (src == "adf" || self.input_source.as_deref() == Some("Feeder")
            || self.input_source.as_deref() == Some("FeederDuplex"))
            && self.multi_page.unwrap_or(true)
            && self.batch_scan.unwrap_or(true)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ScannedPage {
    pub page_number: u32,
    pub mime_type:   String,
    pub base64_data: String,
}

/// How a scan request should be routed to a concrete driver.
#[derive(Debug, Clone)]
pub enum BackendTarget {
    Simulator,
    Wia { device_id: String },
    Escal { ip: String, port: u16 },
}

/// Resolve which backend/runtime should service a scan request.
///
/// Routing is driven by the *device's resolved capabilities* (via the device
/// cache) rather than by guessing from the IP string. This is what fixes:
///   - Brother MFC (eSCL/WSD class, WIA not usable)  -> ESCL
///   - Canon MX490 (WIA-usable)                      -> WIA
pub fn resolve_backend(opts: &ScanOptions, cache: &DeviceCache) -> Result<BackendTarget, String> {
    let devices: Vec<DiscoveredDevice> = if let Ok(c) = cache.try_read() {
        c.clone()
    } else {
        Vec::new()
    };

    let ip = opts.scanner_ip.clone().unwrap_or_default();
    let device_id = opts.device_id.clone().unwrap_or_default();

    // 1. Explicit device id
    if !device_id.is_empty() {
        if let Some(d) = devices.iter().find(|d| d.id == device_id) {
            return target_from_device(d);
        }
        // Device not cached but id looks like a WIA/USB device -> WIA
        if device_id.starts_with("WIA_") || device_id.starts_with("USB_")
            || device_id.to_uppercase().starts_with("SWD\\")
            || device_id.contains("6BDD1FC6")
        {
            return Ok(BackendTarget::Wia { device_id: device_id.clone() });
        }
        return Ok(BackendTarget::Wia { device_id });
    }

    // 2. Simulator
    if ip.is_empty() || ip == "SIMULATOR" || ip == "DEMO" || ip == "MOCK" {
        // Pick a WIA device if any is WIA-usable and we have no IP at all.
        let wia = devices.iter().find(|d| d.backends.iter().any(|b| b == "WIA") && d.status != "network_only");
        if let Some(w) = wia {
            return Ok(BackendTarget::Wia { device_id: wia_device_id(w) });
        }
        // A real device exists but is not currently WIA-scanable (e.g. a
        // network-only/eSCL scanner with no resolved IP) — surface a clear
        // error instead of silently simulating.
        let real_network = devices.iter().find(|d| d.id != "SIMULATOR");
        if let Some(d) = real_network {
            return Err(format!(
                "Scanner '{}' ist aktuell nicht scanbar: {}",
                d.display_name,
                if d.backends.iter().any(|b| b == "ESCL") {
                    "Die Netzwerkadresse (eSCL) konnte nicht ermittelt werden. Bitte Gerät einschalten und erneut nach Druckern suchen.".to_string()
                } else {
                    "Das Gerät ist über Windows-Scan (WIA) nicht erreichbar. Bitte Verbindung prüfen.".to_string()
                }
            ));
        }
        return Ok(BackendTarget::Simulator);
    }

    // 3. WIA/USB prefixed ids sent in `scannerIp`
    if ip.starts_with("WIA_") || ip.starts_with("USB_") || ip == "USB" {
        return Ok(BackendTarget::Wia { device_id: ip.trim_start_matches("WIA_").trim_start_matches("USB_").to_string() });
    }

    // 4. A real IP — find the matching cached device to determine the backend.
    let port = opts.scanner_port.unwrap_or(80);
    if let Some(d) = devices.iter().find(|d| d.ip.as_deref() == Some(ip.as_str())).or_else(|| {
        // fallback: match by normalized model/name
        let ip_low = ip.to_lowercase();
        devices.iter().find(|d| {
            d.name.to_lowercase().contains(&ip_low) || d.model.to_lowercase().contains(&ip_low)
        })
    }) {
        return target_from_device(d);
    }

    // 5. Unknown IP — try eSCL (most network scanners), but if no port data
    //    assume it might be a WIA-addressable device.
    if ip.starts_with("192.168.") || ip.starts_with("10.") || ip.starts_with("172.") {
        return Ok(BackendTarget::Escal { ip, port });
    }
    Ok(BackendTarget::Escal { ip, port })
}

/// Choose the concrete backend for a discovered device.
fn target_from_device(d: &DiscoveredDevice) -> Result<BackendTarget, String> {
    // Respect an explicit backend preference if the caller supplied one via ip
    // heuristics; otherwise use the device's declared backends in priority order.
    if !d.backends.is_empty() {
        // Prefer WIA if the device is actually WIA-scanable (avoids the Canon
        // case where a network IP-backed device must still go through WIA).
        if d.backends.iter().any(|b| b == "WIA") && d.status != "network_only" {
            return Ok(BackendTarget::Wia { device_id: wia_device_id(d) });
        }
        if d.backends.iter().any(|b| b == "ESCL") {
            if let Some(ip) = &d.ip {
                return Ok(BackendTarget::Escal { ip: ip.clone(), port: d.port.unwrap_or(80) });
            }
            return Err(format!(
                "Scanner '{}' wird über eSCL angesprochen, aber keine Netzwerkadresse gefunden. Bitte Gerät einschalten und erneut suchen.",
                d.display_name
            ));
        }
    }
    // No backends declared — infer from protocol/ip
    if d.ip.is_some() {
        return Ok(BackendTarget::Escal { ip: d.ip.clone().unwrap(), port: d.port.unwrap_or(80) });
    }
    Ok(BackendTarget::Wia { device_id: wia_device_id(d) })
}

/// The raw WIA DeviceID for a device (falls back to the sanitized `id`).
fn wia_device_id(d: &DiscoveredDevice) -> String {
    if let Some(w) = &d.wia_id {
        w.clone()
    } else {
        d.id.trim_start_matches("WIA_").to_string()
    }
}

/// Execute a scan synchronously (all pages returned at once).
pub async fn execute_scan(
    opts: ScanOptions,
    cache: &DeviceCache,
) -> Result<Vec<ScannedPage>, String> {
    let target = resolve_backend(&opts, cache)?;
    let sink = |_msg: &str| {};
    scan_with_target(target, opts, &sink, &None).await
}

/// Run a scan against a resolved backend, feeding progress messages to `sink`.
/// `cancel` (when set) lets a running scan be interrupted cooperatively.
pub async fn scan_with_target<F: Fn(&str)>(
    target: BackendTarget,
    opts: ScanOptions,
    sink: &F,
    cancel: &Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
) -> Result<Vec<ScannedPage>, String> {
    match target {
        BackendTarget::Simulator => Ok(simulator::simulate_scan()?),
        #[cfg(target_os = "windows")]
        BackendTarget::Wia { device_id } => wia::scan_wia(&device_id, &opts, sink, cancel).await,
        #[cfg(not(target_os = "windows"))]
        BackendTarget::Wia { .. } => Err("WIA-Scan ist nur unter Windows verfügbar.".into()),
        BackendTarget::Escal { ip, port } => escl::escl_scan(&ip, port, &opts).await,
    }
}
