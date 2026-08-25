pub mod escl;
pub mod simulator;

#[cfg(target_os = "windows")]
pub mod wia;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
    pub scanner_ip:    Option<String>,
    pub scanner_port:  Option<u16>,
    pub dpi:           Option<u32>,
    pub color_mode:    Option<String>,  // "Color" | "Grayscale" | "BlackAndWhite"
    pub input_source:  Option<String>,  // "Platen" | "Feeder" | "FeederDuplex"
    pub format:        Option<String>,  // "jpeg" | "png"
    pub batch_scan:    Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScannedPage {
    pub page_number: u32,
    pub mime_type:   String,
    pub base64_data: String,
}

pub async fn execute_scan(opts: ScanOptions) -> Result<Vec<ScannedPage>, String> {
    let ip   = opts.scanner_ip.clone().unwrap_or_default();
    let port = opts.scanner_port.unwrap_or(80);

    if ip.is_empty() || ip == "SIMULATOR" {
        return simulator::simulate_scan();
    }

    #[cfg(target_os = "windows")]
    if ip.starts_with("WIA_") || ip.starts_with("USB_") || ip == "USB" {
        return wia::wia_scan().await;
    }

    escl::escl_scan(&ip, port, &opts).await
}
