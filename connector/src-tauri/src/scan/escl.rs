use super::{ScanOptions, ScannedPage};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use std::time::Duration;

pub async fn escl_scan(ip: &str, port: u16, opts: &ScanOptions) -> Result<Vec<ScannedPage>, String> {
    let dpi          = opts.dpi.unwrap_or(300);
    let color_mode   = escl_color_mode(opts.color_mode.as_deref().unwrap_or("Grayscale"));
    // Resolve the ADF/flatbed source via the shared helper so the caller's
    // `source` field is honoured (e.g. frontend sending source:"adf").
    let source       = opts.source(); // "auto"|"adf"|"flatbed"
    let use_adf      = source == "adf";
    let input_source = if use_adf { "Feeder" } else { "Platen" };
    let mime         = if opts.format.as_deref() == Some("png") { "image/png" } else { "image/jpeg" };
    let is_https     = port == 443 || port == 8443;
    let proto        = if is_https { "https" } else { "http" };
    let base_url     = format!("{}://{}:{}", proto, ip, port);
    let jobs_url     = format!("{}/eSCL/ScanJobs", base_url);

    let xml = build_scan_xml(dpi, color_mode, input_source, mime);

    log::info!("POSTing eSCL scan job to {} ({}dpi, {}, {})", jobs_url, dpi, color_mode, input_source);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let job_resp = client
        .post(&jobs_url)
        .header("Content-Type", "text/xml; charset=utf-8")
        .body(xml)
        .send()
        .await
        .map_err(|e| format!("eSCL POST failed: {}", e))?;

    if !job_resp.status().is_success() {
        return Err(format!("eSCL POST returned HTTP {}", job_resp.status()));
    }

    let location = job_resp.headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Job1")
        .to_string();

    let job_url   = if location.starts_with("http") { location.clone() } else { format!("{}{}", base_url, location) };
    let doc_url   = if job_url.ends_with("/NextDocument") { job_url.clone() } else { format!("{}/NextDocument", job_url) };

    log::info!("Polling scan result from {}", doc_url);

    let mut pages = Vec::new();
    let batch = use_adf && opts.batch();
    let page_limit = opts.page_count.unwrap_or(0);
    let mut done = false;

    while !done {
        let mut attempts = 0;
        let mut page_bytes: Option<Vec<u8>> = None;

        while attempts < 25 && page_bytes.is_none() {
            attempts += 1;
            let resp = client.get(&doc_url).send().await;
            match resp {
                Ok(r) => {
                    let status = r.status().as_u16();
                    if status == 200 {
                        let bytes = r.bytes().await.map_err(|e| e.to_string())?;
                        if bytes.len() > 100 { page_bytes = Some(bytes.to_vec()); }
                        else { tokio::time::sleep(Duration::from_millis(1200)).await; }
                    } else if status == 404 { done = true; break; }
                    else { tokio::time::sleep(Duration::from_millis(1200)).await; }
                }
                Err(_) => { tokio::time::sleep(Duration::from_millis(1200)).await; }
            }
        }

        if let Some(bytes) = page_bytes {
            let n = (pages.len() + 1) as u32;
            log::info!("Page {} scanned ({} bytes)", n, bytes.len());
            pages.push(ScannedPage {
                page_number: n,
                mime_type:   mime.to_string(),
                base64_data: B64.encode(&bytes),
            });
            if !batch || (page_limit > 0 && pages.len() as u32 >= page_limit) { done = true; }
        } else {
            done = true;
        }
    }

    if pages.is_empty() { return Err("Scanner returned no pages.".into()); }
    Ok(pages)
}

fn build_scan_xml(dpi: u32, color_mode: &str, input_source: &str, mime: &str) -> String {
    let a4_w = ((210.0 / 25.4) * dpi as f64) as u32;
    let a4_h = ((297.0 / 25.4) * dpi as f64) as u32;
    format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings
  xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
  xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.6</pwg:Version>
  <scan:Intent>Document</scan:Intent>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:Height>{a4_h}</pwg:Height>
      <pwg:Width>{a4_w}</pwg:Width>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>{input_source}</pwg:InputSource>
  <scan:ColorMode>{color_mode}</scan:ColorMode>
  <scan:XResolution>{dpi}</scan:XResolution>
  <scan:YResolution>{dpi}</scan:YResolution>
  <pwg:DocumentFormat>{mime}</pwg:DocumentFormat>
</scan:ScanSettings>"#)
}

fn escl_color_mode(mode: &str) -> &str {
    match mode {
        "Color"         => "RGB24",
        "BlackAndWhite" => "BlackAndWhite1",
        _               => "Grayscale8",
    }
}
