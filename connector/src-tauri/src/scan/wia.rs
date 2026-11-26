use super::{ScanOptions, ScannedPage};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;

use crate::bridge;

/// Scan via the Windows WIA bridge (`ScannerBridge.exe`).
///
/// `device_id` is the raw WIA DeviceID (from `discovery::wia` -> `wia_id`).
/// Progress messages are forwarded to `sink`. If `cancel` is provided and set,
/// the bridge child process is killed (the bridge handles cancellation by
/// process termination).
pub async fn scan_wia<F: Fn(&str)>(
    device_id: &str,
    opts: &ScanOptions,
    sink: &F,
    cancel: &Option<Arc<AtomicBool>>,
) -> Result<Vec<ScannedPage>, String> {
    // Resolve the raw WIA id. The caller may pass a full/sanitized id; hand the
    // bridge the raw form when present.
    let resolved_id = resolve_wia_id(device_id);

    let out_dir = std::env::temp_dir().join(format!("logiflow_scan_{}", timestamp()));
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("Temp-Verzeichnis konnte nicht erstellt werden: {}", e))?;

    let source = opts.source();
    let dpi    = opts.dpi.unwrap_or(300);
    let color  = opts.color_mode.as_deref().unwrap_or("Grayscale").to_string();
    let duplex = opts.duplex();
    let page_limit = opts.page_count.unwrap_or(0) as usize;

    log::info!("WIA scan via bridge: source={} dpi={} color={} duplex={}", source, dpi, color, duplex);

    let mut pages: Vec<ScannedPage> = Vec::new();
    let mut next_page: u32 = 1;
    let mut stalled_runs = 0;
    let mut error: Option<String> = None;
    const MAX_PAGES: usize = 40;

    // The Windows driver of some scanners ends the bridge process in the middle of a feeder job.
    // When that happens after at least one page, start a new bridge process (fresh WIA
    // connection) and continue with the next sheet until the feeder is empty.
    loop {
        let payload = serde_json::json!({
            "cmd": "scan",
            "deviceId": resolved_id,
            "source": source,
            "duplex": duplex,
            "dpi": dpi,
            "colorMode": color,
            "outputDir": out_dir.to_string_lossy(),
            "jobKey": "sync",
            "pageStart": next_page
        });
        let remaining = if page_limit > 0 { page_limit.saturating_sub(pages.len()) } else { 0 };
        let run = run_bridge(&payload, remaining, sink, cancel).await?;
        let gained = run.pages.len();
        if let Some(max) = run.pages.iter().map(|p| p.page_number).max() {
            next_page = max + 1;
        }
        pages.extend(run.pages);

        if let Some(e) = run.error {
            if pages.is_empty() { error = Some(e); } else { log::info!("WIA bridge reported after {} page(s): {}", pages.len(), e); }
            break;
        }
        if run.finished { break; }
        if cancelled_msg(cancel).is_some() { break; }
        if page_limit > 0 && pages.len() >= page_limit { break; }
        if pages.len() >= MAX_PAGES { break; }

        // The bridge ended without its final "ok": it crashed or was cut off.
        if gained == 0 { stalled_runs += 1; } else { stalled_runs = 0; }
        if stalled_runs >= 2 { log::warn!("WIA bridge ended twice without a new page, stopping"); break; }
        if pages.is_empty() && stalled_runs >= 1 && gained == 0 && next_page == 1 {
            // first run produced nothing and ended abnormally: one more try only
            log::warn!("WIA bridge ended without a page, retrying once");
        } else {
            log::warn!("WIA bridge ended after {} page(s) without finishing, continuing with page {}", pages.len(), next_page);
            sink(&format!("Scanner neu verbunden, suche weitere Seiten (ab Seite {}) ...", next_page));
        }
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    }

    // Cleanup temp dir (only files, best-effort).
    let _ = std::fs::remove_dir_all(&out_dir);

    if let Some(e) = error {
        return Err(e);
    }

    if pages.is_empty() {
        // If the child finished with no pages output, surface a helpful error.
        return Err(cancelled_msg(cancel).unwrap_or_else(|| {
            if source == "adf" {
                "Keine Seiten erfasst. Bitte Dokumente in den automatischen Einzug (ADF) legen.".to_string()
            } else {
                "Keine Seite erfasst. Bitte Dokument auf das Flachbettglas legen oder den Scanner prüfen.".to_string()
            }
        }));
    }

    log::info!("WIA scan complete: {} page(s)", pages.len());
    Ok(pages)
}

struct BridgeRun {
    pages: Vec<ScannedPage>,
    error: Option<String>,
    /// True when the bridge sent its final "ok" (normal end of the job).
    finished: bool,
}

async fn run_bridge<F: Fn(&str)>(
    payload: &serde_json::Value,
    page_limit: usize,
    sink: &F,
    cancel: &Option<Arc<AtomicBool>>,
) -> Result<BridgeRun, String> {
    use tokio::io::{AsyncBufReadExt, AsyncReadExt};

    let mut child = tokio::process::Command::new(bridge::bridge_path().ok_or_else(|| {
        "WIA ScannerBridge.exe nicht gefunden. Bitte Connector neu installieren.".to_string()
    })?)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("ScannerBridge konnte nicht gestartet werden: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut stderr = child.stderr.take();

    // Write the command.
    {
        let mut line = payload.to_string();
        line.push('\n');
        stdin.write_all(line.as_bytes()).await.map_err(|e| format!("bridge write: {}", e))?;
        stdin.flush().await.map_err(|e| e.to_string())?;
    }

    // Read output lines until the job finishes (terminal `ok` / `event:error`).
    let mut lines = tokio::io::BufReader::new(stdout).lines();
    let mut pages: Vec<ScannedPage> = Vec::new();
    let mut error: Option<String> = None;
    let mut finished = false;

    loop {
        // A page transfer must not block forever (e.g. a feeder that never answers).
        let line = match tokio::time::timeout(std::time::Duration::from_secs(120), lines.next_line()).await {
            Ok(Ok(Some(l))) => l,
            Ok(_) => break,
            Err(_) => {
                error = Some("Zeitüberschreitung beim Scannen. Bitte Scanner prüfen und erneut versuchen.".to_string());
                break;
            }
        };
        // Allow cancellation between lines.
        if let Some(c) = cancel {
            if c.load(Ordering::Relaxed) {
                break;
            }
        }
        if line.is_empty() { continue; }

        let val: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => { log::warn!("bridge returned non-JSON line: {}", line); continue; }
        };

        if let Some(ev) = val.get("event").and_then(|e| e.as_str()) {
            match ev {
                "page" => {
                    if let Some(file) = val.get("file").and_then(|f| f.as_str()) {
                        let pg = val.get("page").and_then(|p| p.as_u64()).unwrap_or(pages.len() as u64 + 1) as u32;
                        // The bridge writes each page as a file; read & base64.
                        if let Ok(b) = std::fs::read(file) {
                            pages.push(ScannedPage {
                                page_number: pg,
                                mime_type:   "image/jpeg".into(),
                                base64_data: B64.encode(&b),
                            });
                        }
                        // Bail if we already have the requested number of pages.
                        if page_limit > 0 && pages.len() >= page_limit {
                            break;
                        }
                    }
                }
                "progress" => {
                    if let Some(m) = val.get("message").and_then(|m| m.as_str()) {
                        sink(m);
                    }
                }
                "log" => {
                    if let Some(m) = val.get("message").and_then(|m| m.as_str()) {
                        log::info!("WIA bridge: {}", m);
                    }
                }
                "error" => {
                    error = Some(val.get("message").and_then(|m| m.as_str()).unwrap_or("WIA-Fehler").to_string());
                    break;
                }
                _ => {}
            }
        } else if val.get("ok").is_some() {
            finished = true;
            break;
        }
    }

    // Did the bridge exit by itself? Log how (a crash leaves no other trace).
    match child.try_wait() {
        Ok(Some(status)) if !finished && error.is_none() => {
            log::warn!("WIA bridge exited on its own without finishing: {}", status);
            if let Some(mut err) = stderr.take() {
                let mut buf = String::new();
                let _ = tokio::time::timeout(std::time::Duration::from_secs(1), err.read_to_string(&mut buf)).await;
                let tail: String = buf.chars().rev().take(500).collect::<Vec<_>>().into_iter().rev().collect();
                if !tail.trim().is_empty() { log::warn!("WIA bridge stderr: {}", tail.trim()); }
            }
        }
        _ => {}
    }

    // Ensure the child is cleaned up.
    let _ = stdin.shutdown().await;
    let _ = child.kill().await;
    let _ = child.wait().await;

    Ok(BridgeRun { pages, error, finished })
}

fn cancelled_msg(cancel: &Option<Arc<AtomicBool>>) -> Option<String> {
    if let Some(c) = cancel {
        if c.load(Ordering::Relaxed) { return Some("Scan abgebrochen".into()); }
    }
    None
}

/// The bridge matches devices by substring of the raw WIA id. If `device_id`
/// was already a full WIA id it is used as-is; if it is prefixed with `WIA_`
/// or `USB_` those are stripped.
fn resolve_wia_id(device_id: &str) -> String {
    let d = device_id.trim_start_matches("WIA_").trim_start_matches("USB_");
    if d.is_empty() { device_id.to_string() } else { d.to_string() }
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
