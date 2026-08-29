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

    // Build the bridge scan command.
    let payload = serde_json::json!({
        "cmd": "scan",
        "deviceId": resolved_id,
        "source": source,
        "duplex": duplex,
        "dpi": dpi,
        "colorMode": color,
        "outputDir": out_dir.to_string_lossy(),
        "jobKey": "sync"
    });

    log::info!("WIA scan via bridge: source={} dpi={} color={} duplex={}", source, dpi, color, duplex);

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

    // Write the command.
    {
        let mut line = payload.to_string();
        line.push('\n');
        stdin.write_all(line.as_bytes()).await.map_err(|e| format!("bridge write: {}", e))?;
        stdin.flush().await.map_err(|e| e.to_string())?;
    }

    // Read output lines until the job finishes (terminal `ok` / `event:error`).
    use tokio::io::AsyncBufReadExt;
    let mut lines = tokio::io::BufReader::new(stdout).lines();
    let mut pages: Vec<ScannedPage> = Vec::new();
    let mut error: Option<String> = None;
    let page_count = opts.page_count.unwrap_or(0);

    while let Ok(Some(line)) = lines.next_line().await {
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
                            // Edge: bridge jpg extension; if user wants png we keep jpeg.
                        }
                        // Bail if we already have the requested number of pages.
                        if page_count > 0 && (pages.len() as u32) >= page_count {
                            break;
                        }
                    }
                }
                "progress" => {
                    if let Some(m) = val.get("message").and_then(|m| m.as_str()) {
                        sink(m);
                    }
                }
                "error" => {
                    error = Some(val.get("message").and_then(|m| m.as_str()).unwrap_or("WIA-Fehler").to_string());
                    break;
                }
                _ => {}
            }
        } else if val.get("ok").is_some() {
            break;
        }
    }

    // Ensure the child is cleaned up.
    let _ = stdin.shutdown().await;
    let _ = child.kill().await;
    let _ = child.wait().await;

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
