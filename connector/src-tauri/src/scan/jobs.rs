//! Async scan job manager. Each scan that goes through `/scan/job` is tracked
//! here so the frontend can poll `/scan/{id}/status` for live progress and
//! multi-page ADF results, and cancel via `/scan/{id}/cancel`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

use super::{ScanOptions, ScannedPage, resolve_backend, scan_with_target};
use crate::DeviceCache;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum JobStatus {
    Queued,
    Scanning,
    Completed,
    Failed,
    Cancelled,
}

/// Mutable per-job state shared with the handler threads.
#[derive(Debug)]
pub struct ScanJobState {
    pub id:         String,
    pub status:     JobStatus,
    pub message:    String,
    pub pages:      Vec<ScannedPage>,
    pub error:      Option<String>,
    pub page_count: u32,
}

pub type SharedJobs = Arc<RwLock<HashMap<String, Arc<RwLock<ScanJobState>>>>>;

/// A running job handle used to request cancellation.
pub struct RunningJob {
    pub cancel: Arc<AtomicBool>,
}

pub type JobRegistry = Arc<RwLock<HashMap<String, RunningJob>>>;

pub fn new_registry() -> (SharedJobs, JobRegistry) {
    (Arc::new(RwLock::new(HashMap::new())), Arc::new(RwLock::new(HashMap::new())))
}

pub fn new_job_id() -> String {
    format!(
        "{:x}{}",
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
        rand_hex(),
    )
}

fn rand_hex() -> String {
    let seed = std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().subsec_nanos();
    let mut out = String::with_capacity(8);
    let chars = b"0123456789abcdef";
    let mut x = seed;
    for _ in 0..8 {
        out.push(chars[(x & 0xf) as usize] as char);
        x = x.wrapping_mul(1103515245).wrapping_add(12345) >> 1;
    }
    out
}

/// Create and start an async scan job. Returns the new job id.
pub async fn start_job(
    opts: ScanOptions,
    cache: DeviceCache,
    jobs: &SharedJobs,
    registry: &JobRegistry,
) -> Result<String, String> {
    let id = new_job_id();
    let cancel = Arc::new(AtomicBool::new(false));

    let state = Arc::new(RwLock::new(ScanJobState {
        id: id.clone(),
        status: JobStatus::Scanning,
        message: "Scanauftrag wird gestartet...".to_string(),
        pages: Vec::new(),
        error: None,
        page_count: 0,
    }));

    jobs.write().await.insert(id.clone(), state.clone());
    registry.write().await.insert(id.clone(), RunningJob { cancel: cancel.clone() });

    let target = resolve_backend(&opts, &cache)?;

    let state_for_run = state.clone();
    let cancel_for_run = cancel.clone();
    let opts_for_run = opts.clone();
    let jobs_for_run = jobs.clone();
    let registry_for_run = registry.clone();
    let id_for_run = id.clone();

    tokio::spawn(async move {
        // Progress callback updates the job state (message / page_count).
        let sink = {
            let st = state_for_run.clone();
            move |msg: &str| {
                let st = st.clone();
                let owned = msg.to_string();
                tokio::spawn(async move {
                    let mut s = st.write().await;
                    if !owned.is_empty() {
                        s.message = owned;
                        s.page_count = s.pages.len() as u32;
                    }
                });
            }
        };

        let result = scan_with_target(target, opts_for_run, &sink, &Some(cancel_for_run.clone())).await;

        let mut final_state = state_for_run.write().await;
        match result {
            Ok(pages) => {
                let count = pages.len() as u32;
                final_state.pages = pages;
                final_state.page_count = count;
                final_state.status = if cancel_for_run.load(Ordering::Relaxed) {
                    JobStatus::Cancelled
                } else {
                    JobStatus::Completed
                };
                final_state.message = format!("Scan abgeschlossen ({} Seite(n)).", count);
            }
            Err(e) => {
                final_state.error = Some(e.clone());
                final_state.status = if cancel_for_run.load(Ordering::Relaxed) {
                    JobStatus::Cancelled
                } else {
                    JobStatus::Failed
                };
                final_state.message = e;
            }
        }
        drop(final_state);

        // Remove the running handle (keep the job state for status polling).
        registry_for_run.write().await.remove(&id_for_run);
        let _ = jobs_for_run;
    });

    Ok(id)
}

/// Request cancellation of a running scan job.
pub async fn cancel_job(id: &str, registry: &JobRegistry) -> bool {
    if let Some(entry) = registry.read().await.get(id) {
        entry.cancel.store(true, Ordering::Relaxed);
        true
    } else {
        false
    }
}
