use super::{ScanOptions, ScannedPage};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use std::time::{Duration, Instant};

/// True when the eSCL ScannerCapabilities document advertises an automatic document feeder.
pub fn caps_has_feeder(xml: &str) -> bool {
    let l = xml.to_lowercase();
    l.contains("<scan:adf") || l.contains("adfsimplexinputcaps") || l.contains("feeder")
}

/// Decide whether to scan from the feeder. An explicit "adf"/"flatbed" always wins;
/// "auto" uses the feeder whenever the device advertises one.
pub fn resolve_use_adf(source: &str, has_feeder: bool) -> bool {
    match source {
        "adf" => true,
        "flatbed" => false,
        _ => has_feeder,
    }
}

pub async fn escl_scan(ip: &str, port: u16, opts: &ScanOptions) -> Result<Vec<ScannedPage>, String> {
    let dpi          = opts.dpi.unwrap_or(300);
    let color_mode   = escl_color_mode(opts.color_mode.as_deref().unwrap_or("Grayscale"));
    let source       = opts.source(); // "auto"|"adf"|"flatbed"
    let mime         = if opts.format.as_deref() == Some("png") { "image/png" } else { "image/jpeg" };
    let is_https     = port == 443 || port == 8443;
    let proto        = if is_https { "https" } else { "http" };
    let base_url     = format!("{}://{}:{}", proto, ip, port);
    let jobs_url     = format!("{}/eSCL/ScanJobs", base_url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    // In "auto" mode ask the scanner whether it has a feeder.
    let mut has_feeder = false;
    if source == "auto" {
        if let Ok(r) = client
            .get(format!("{}/eSCL/ScannerCapabilities", base_url))
            .timeout(Duration::from_secs(6))
            .send()
            .await
        {
            if r.status().is_success() {
                if let Ok(body) = r.text().await { has_feeder = caps_has_feeder(&body); }
            }
        }
    }
    let mut use_adf = resolve_use_adf(&source, has_feeder);

    let mut job_resp = post_job(&client, &jobs_url, dpi, color_mode, use_adf, mime).await?;
    if !job_resp.status().is_success() && use_adf && source == "auto" {
        // Feeder rejected (e.g. empty or busy): fall back to the flatbed in auto mode.
        log::warn!("eSCL feeder job rejected (HTTP {}), falling back to flatbed", job_resp.status());
        use_adf = false;
        job_resp = post_job(&client, &jobs_url, dpi, color_mode, false, mime).await?;
    }
    if !job_resp.status().is_success() {
        let st = job_resp.status();
        return Err(if use_adf && (st.as_u16() == 409 || st.as_u16() == 503) {
            "Der Scanner lehnt den Einzug ab. Bitte Papier in den ADF legen und erneut versuchen.".to_string()
        } else {
            format!("eSCL POST returned HTTP {}", st)
        });
    }

    let location = job_resp.headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Job1")
        .to_string();

    let job_url = if location.starts_with("http") { location.clone() } else { format!("{}{}", base_url, location) };
    let job_url = job_url.trim_end_matches("/NextDocument").to_string();
    let doc_url = format!("{}/NextDocument", job_url);

    log::info!("Polling scan result from {} (feeder: {})", doc_url, use_adf);

    let mut pages: Vec<ScannedPage> = Vec::new();
    let batch = use_adf && opts.batch_flag();
    let page_limit = opts.page_count.unwrap_or(0);
    let deadline = Instant::now() + Duration::from_secs(180);
    let mut timed_out = false;

    'pages: loop {
        // After the first page, a feeder that is empty may answer 404, 503 or hang on
        // the next request. Use a short budget so the job ends instead of hanging.
        let first = pages.is_empty();
        let max_attempts = if first { 25 } else { 2 };
        let req_timeout = Duration::from_secs(if first { 25 } else { 8 });
        let mut page_bytes: Option<Vec<u8>> = None;
        let mut attempts = 0;

        while attempts < max_attempts && page_bytes.is_none() {
            if Instant::now() > deadline { timed_out = true; break 'pages; }
            attempts += 1;
            match client.get(&doc_url).timeout(req_timeout).send().await {
                Ok(r) => {
                    let status = r.status().as_u16();
                    if status == 200 {
                        let bytes = r.bytes().await.map_err(|e| e.to_string())?;
                        if bytes.len() > 100 { page_bytes = Some(bytes.to_vec()); }
                        else { tokio::time::sleep(Duration::from_millis(1200)).await; }
                    } else if status == 404 {
                        break 'pages;
                    } else {
                        tokio::time::sleep(Duration::from_millis(1200)).await;
                    }
                }
                Err(_) => { tokio::time::sleep(Duration::from_millis(1200)).await; }
            }
        }

        match page_bytes {
            Some(bytes) => {
                let n = (pages.len() + 1) as u32;
                log::info!("Page {} scanned ({} bytes)", n, bytes.len());
                pages.push(ScannedPage {
                    page_number: n,
                    mime_type:   mime.to_string(),
                    base64_data: B64.encode(&bytes),
                });
                if !batch || (page_limit > 0 && pages.len() as u32 >= page_limit) { break; }
            }
            None => break,
        }
    }

    // Best effort: release the scanner job so the device does not stay busy.
    let _ = client.delete(&job_url).timeout(Duration::from_secs(5)).send().await;

    if pages.is_empty() {
        return Err(if timed_out {
            "Zeitüberschreitung beim Scannen. Bitte Scanner prüfen und erneut versuchen.".to_string()
        } else if use_adf {
            "Keine Seiten vom Einzug erhalten. Bitte Papier in den ADF legen.".to_string()
        } else {
            "Scanner returned no pages.".to_string()
        });
    }
    Ok(pages)
}

async fn post_job(
    client: &reqwest::Client,
    jobs_url: &str,
    dpi: u32,
    color_mode: &str,
    use_adf: bool,
    mime: &str,
) -> Result<reqwest::Response, String> {
    let input_source = if use_adf { "Feeder" } else { "Platen" };
    let xml = build_scan_xml(dpi, color_mode, input_source, mime);
    log::info!("POSTing eSCL scan job to {} ({}dpi, {}, {})", jobs_url, dpi, color_mode, input_source);
    client
        .post(jobs_url)
        .header("Content-Type", "text/xml; charset=utf-8")
        .body(xml)
        .send()
        .await
        .map_err(|e| format!("eSCL POST failed: {}", e))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_uses_feeder_when_available() {
        assert!(resolve_use_adf("auto", true));
        assert!(!resolve_use_adf("auto", false));
    }

    #[test]
    fn explicit_source_wins() {
        assert!(resolve_use_adf("adf", false));
        assert!(!resolve_use_adf("flatbed", true));
    }

    #[test]
    fn detects_feeder_in_capabilities() {
        assert!(caps_has_feeder("<scan:Adf><scan:AdfSimplexInputCaps/></scan:Adf>"));
        assert!(caps_has_feeder("<pwg:InputSource>Feeder</pwg:InputSource>"));
        assert!(!caps_has_feeder("<scan:Platen><scan:PlatenInputCaps/></scan:Platen>"));
    }
}
