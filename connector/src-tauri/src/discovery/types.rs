use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCapabilities {
    pub printing:             bool,
    pub scanning:             bool,
    pub adf:                  bool,
    pub duplex:               bool,
    pub flatbed:              bool,
    pub color:                bool,
    pub grayscale:            bool,
    pub supported_dpi:        Vec<u32>,
    pub supported_paper_sizes: Vec<String>,
    pub document_formats:     Vec<String>,
}

impl Default for DeviceCapabilities {
    fn default() -> Self {
        Self {
            printing:             true,
            scanning:             true,
            adf:                  false,
            duplex:               false,
            flatbed:              true,
            color:                true,
            grayscale:            true,
            supported_dpi:        vec![150, 300, 600],
            supported_paper_sizes: vec!["A4".into(), "Letter".into()],
            document_formats:     vec!["image/jpeg".into(), "image/png".into()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDevice {
    pub id:              String,
    pub name:            String,
    pub display_name:    String,
    pub manufacturer:    String,
    pub model:           String,
    #[serde(rename = "type")]
    pub device_type:     String,  // "printer_scanner" | "printer" | "scanner"
    pub connection_type: String,  // "WIFI" | "USB"
    pub ip:              Option<String>,
    pub port:            Option<u16>,
    pub protocol:        String,
    pub serial:          Option<String>,
    pub status:          String,
    pub status_details:  String,
    pub capabilities:    DeviceCapabilities,
    /// Backends that can actually drive this device, in priority order.
    /// e.g. ["WIA"] for USB devices, ["ESCL"] for WSD/eSCL network scanners,
    /// or ["WIA","ESCL"] when both are usable. Used by the scan router to pick
    /// the correct backend instead of guessing from the IP prefix.
    #[serde(default)]
    pub backends: Vec<String>,
    /// The primary backend resolved during discovery (empty = unresolved yet).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
    /// Raw WIA DeviceID (e.g. `{6BDD1FC6-...}\0000`) used to scan via WIA.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wia_id: Option<String>,
}

impl DiscoveredDevice {
    pub fn simulator() -> Self {
        Self {
            id:              "SIMULATOR".into(),
            name:            "LogiFlow Scanner Simulator".into(),
            display_name:    "WLAN-Scanner Simulator (Test-Modus)".into(),
            manufacturer:    "LogiFlow".into(),
            model:           "Virtual AirScan 3000".into(),
            device_type:     "printer_scanner".into(),
            connection_type: "WIFI".into(),
            ip:              Some("SIMULATOR".into()),
            port:            Some(80),
            protocol:        "SIMULATOR".into(),
            serial:          None,
            status:          "available".into(),
            status_details:  "Virtueller Testscanner (Demo-Modus)".into(),
            backends:        vec!["SIMULATOR".into()],
            backend:         Some("SIMULATOR".into()),
            wia_id:          None,
            capabilities:    DeviceCapabilities {
                adf:    true,
                duplex: true,
                document_formats: vec![
                    "image/jpeg".into(),
                    "image/png".into(),
                    "application/pdf".into(),
                ],
                ..Default::default()
            },
        }
    }
}
