use std::collections::HashSet;
use super::types::{DiscoveredDevice, DeviceCapabilities};

const ESCL_PORTS: &[u16] = &[80, 8080, 443, 8443, 5757, 9100];
const PROBE_TIMEOUT_SECS: u64 = 2;

pub async fn probe_escl_device(
    ip: &str,
    _name_hint: Option<String>,
    seen_serials: &mut HashSet<String>,
) -> Option<DiscoveredDevice> {
    for &port in ESCL_PORTS {
        // TCP reachability check
        if !tcp_reachable(ip, port).await { continue; }

        let is_https = port == 443 || port == 8443;
        let proto    = if is_https { "https" } else { "http" };
        let cap_url  = format!("{}://{}:{}/eSCL/ScannerCapabilities", proto, ip, port);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(PROBE_TIMEOUT_SECS))
            .danger_accept_invalid_certs(true)
            .build()
            .ok()?;

        let resp = match client.get(&cap_url).send().await {
            Ok(r) if r.status() == 200 => r,
            _ => continue,
        };

        let body = resp.text().await.ok()?;
        let make_model   = extract_xml(&body, "MakeAndModel").or_else(|| extract_xml(&body, "Model")).unwrap_or_else(|| "eSCL Scanner".to_string());
        let manufacturer = extract_xml(&body, "Manufacturer").unwrap_or_else(|| detect_manufacturer(&make_model));
        let serial       = extract_xml(&body, "SerialNumber");
        let uuid         = extract_xml(&body, "UUID");

        let dedup_key = serial.clone().map(|s| format!("SERIAL_{}", s.to_uppercase()))
            .or_else(|| uuid.clone().map(|u| format!("UUID_{}", u.to_uppercase())))
            .unwrap_or_else(|| format!("ESCL_{}_{}", ip, port));

        if seen_serials.contains(&dedup_key) { return None; }
        seen_serials.insert(dedup_key.clone());

        let device_id = serial.as_ref()
            .map(|s| sanitize_id(&format!("ESCL_{}_{}", manufacturer, s)))
            .unwrap_or_else(|| sanitize_id(&format!("ESCL_{}_{}", ip.replace('.', "_"), port)));

        let caps = parse_capabilities(&body);
        let clean_model  = normalize_model(&make_model);
        let display_name = format!("{} {}", manufacturer, clean_model);

        log::info!("eSCL device found: {} at {}:{}", display_name, ip, port);

        return Some(DiscoveredDevice {
            id:              device_id,
            name:            make_model,
            display_name,
            manufacturer,
            model:           clean_model,
            device_type:     "printer_scanner".into(),
            connection_type: "WIFI".into(),
            ip:              Some(ip.to_string()),
            port:            Some(port),
            protocol:        "ESCL".into(),
            serial,
            status:          "available".into(),
            status_details:  format!("eSCL AirScan ({}:{})", ip, port),
            backends:        vec!["ESCL".into()],
            backend:         Some("ESCL".into()),
            wia_id:          None,
            capabilities:    caps,
        });
    }
    None
}

async fn tcp_reachable(ip: &str, port: u16) -> bool {
    use tokio::net::TcpStream;
    use tokio::time::timeout;
    let addr = format!("{}:{}", ip, port);
    timeout(
        std::time::Duration::from_millis(1200),
        TcpStream::connect(&addr),
    ).await.map(|r| r.is_ok()).unwrap_or(false)
}

fn extract_xml(xml: &str, tag: &str) -> Option<String> {
    // Simple regex-free extraction for ESCL XML
    let open1 = format!("<{}>", tag);
    let open2 = format!("<scan:{}>", tag);
    let open3 = format!("<pwg:{}>", tag);

    for open in &[open1, open2, open3] {
        if let Some(start) = xml.find(open.as_str()) {
            let after = &xml[start + open.len()..];
            if let Some(end) = after.find('<') {
                let val = after[..end].trim().to_string();
                if !val.is_empty() { return Some(val); }
            }
        }
    }
    None
}

fn parse_capabilities(body: &str) -> DeviceCapabilities {
    let has_adf     = body.to_lowercase().contains("feeder") || body.to_lowercase().contains("adf");
    let has_duplex  = body.to_lowercase().contains("duplex");
    let has_flatbed = body.to_lowercase().contains("platen") || body.to_lowercase().contains("flatbed") || !has_adf;
    let has_color   = body.to_lowercase().contains("rgb") || body.to_lowercase().contains("color");

    // Extract DPI values
    let mut dpis: Vec<u32> = Vec::new();
    let mut search = body;
    while let Some(pos) = search.find("XResolution") {
        search = &search[pos + 11..];
        if let Some(val_start) = search.find('>') {
            let after = &search[val_start + 1..];
            if let Some(val_end) = after.find('<') {
                if let Ok(dpi) = after[..val_end].trim().parse::<u32>() {
                    if !dpis.contains(&dpi) { dpis.push(dpi); }
                }
            }
        }
    }
    if dpis.is_empty() { dpis = vec![150, 300, 600]; }
    dpis.sort_unstable();

    DeviceCapabilities {
        printing: true,
        scanning: true,
        adf:      has_adf,
        duplex:   has_duplex,
        flatbed:  has_flatbed,
        color:    has_color || true,
        grayscale: true,
        supported_dpi: dpis,
        supported_paper_sizes: vec!["A4".into(), "Letter".into()],
        document_formats: vec!["image/jpeg".into(), "image/png".into()],
    }
}

fn detect_manufacturer(name: &str) -> String {
    let n = name.to_uppercase();
    if n.contains("BROTHER")  { return "Brother".into(); }
    if n.contains("HP") || n.contains("HEWLETT") || n.contains("OFFICEJET") || n.contains("LASERJET") { return "HP".into(); }
    if n.contains("CANON") || n.contains("PIXMA")   { return "Canon".into(); }
    if n.contains("EPSON") || n.contains("ECOTANK") { return "Epson".into(); }
    if n.contains("XEROX")    { return "Xerox".into(); }
    if n.contains("KYOCERA")  { return "Kyocera".into(); }
    if n.contains("RICOH")    { return "Ricoh".into(); }
    if n.contains("LEXMARK")  { return "Lexmark".into(); }
    "Network Device".into()
}

fn normalize_model(name: &str) -> String {
    let prefixes = ["Brother", "HP", "Hewlett-Packard", "Canon", "Epson", "Lexmark", "Xerox", "Kyocera", "Ricoh", "Samsung"];
    let mut s = name.to_string();
    for p in prefixes {
        if s.to_lowercase().starts_with(&p.to_lowercase()) {
            s = s[p.len()..].trim().to_string();
            break;
        }
    }
    s
}

fn sanitize_id(s: &str) -> String {
    s.chars().map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).collect()
}
