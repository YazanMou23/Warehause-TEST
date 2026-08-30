use actix_web::{
    web, App, HttpRequest, HttpResponse, HttpServer, middleware,
};
use serde_json::json;

use crate::{SharedConfig, DeviceCache, auth::is_origin_allowed};
use crate::discovery;
use crate::scan;
use crate::scan::jobs::{SharedJobs, JobRegistry};

/// Returns the request's Origin if present, and whether it is allowed.
fn origin_status(req: &HttpRequest, cfg: &crate::config::ConnectorConfig) -> (Option<String>, bool) {
    let origin = req.headers().get("origin").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let allowed = is_origin_allowed(origin.as_deref(), &cfg.allowed_origins);
    (origin, allowed)
}

fn cors_headers(res: &mut actix_web::http::header::HeaderMap, origin: Option<&str>, allowed: &[String]) {
    use actix_web::http::header::*;
    let o = if let Some(origin) = origin {
        // Reflect allowed origins so the browser trusts the response.
        if allowed.iter().any(|a| a == origin) { origin.to_string() }
        else { "null".to_string() }
    } else {
        // No Origin (curl / server-side call) — allow localhost.
        "http://localhost".to_string()
    };
    res.insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_str(&o).unwrap());
    res.insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, POST, PUT, DELETE, OPTIONS"));
    res.insert(ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type, Authorization"));
    res.insert(
        actix_web::http::header::HeaderName::from_static("access-control-allow-private-network"),
        HeaderValue::from_static("true")
    );
}

fn reject_forbidden() -> HttpResponse {
    HttpResponse::Forbidden().json(json!({ "error": "Origin not allowed" }))
}

// ── GET /health ──────────────────────────────────────────────────────────────
async fn health(req: HttpRequest, cfg: web::Data<SharedConfig>) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed {
        return reject_forbidden();
    }
    let mut res = HttpResponse::Ok().json(json!({
        "status":           "ok",
        "version":          env!("CARGO_PKG_VERSION"),
        "connectorVersion": env!("CARGO_PKG_VERSION"),
        "platform":         std::env::consts::OS,
        "connectorId":      config.connector_id,
        "port":             config.port,
        "timestamp":        chrono_now(),
    }));
    let mut hm = std::mem::take(res.headers_mut());
    cors_headers(&mut hm, origin.as_deref(), &config.allowed_origins);
    *res.headers_mut() = hm;
    res
}

// ── GET /devices & /scanners ─────────────────────────────────────────────────
async fn get_devices(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    cache: web::Data<DeviceCache>,
) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed { return reject_forbidden(); }

    let devices = cache.read().await.clone();
    let mut res = HttpResponse::Ok().json(&devices);
    let mut hm = std::mem::take(res.headers_mut());
    cors_headers(&mut hm, origin.as_deref(), &config.allowed_origins);
    *res.headers_mut() = hm;
    res
}

async fn force_discover(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    cache: web::Data<DeviceCache>,
) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed { return reject_forbidden(); }
    let allowed_origins = config.allowed_origins.clone();
    drop(config);

    let discovered = discovery::run_discovery().await;
    let mut c = cache.write().await;
    *c = discovered.clone();
    drop(c);

    let mut res = HttpResponse::Ok().json(&discovered);
    let mut hm = std::mem::take(res.headers_mut());
    cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
    *res.headers_mut() = hm;
    res
}

// ── POST /connect ────────────────────────────────────────────────────────────
/// Verify/refresh a device's capabilities and backend readiness.
async fn connect_device(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    cache: web::Data<DeviceCache>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed { return reject_forbidden(); }
    let allowed_origins = config.allowed_origins.clone();
    drop(config);

    let body_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let body_ip = body.get("ip").and_then(|v| v.as_str()).map(|s| s.to_string());

    let devices = cache.read().await.clone();
    let found = devices.iter().find(|d| d.id == body_id)
        .or_else(|| {
            if let Some(ip) = &body_ip {
                devices.iter().find(|d| d.ip.as_deref() == Some(ip.as_str()))
            } else { None }
        })
        .cloned();

    let mut result = json!({
        "backend": found.as_ref().and_then(|d| d.backend.clone()).unwrap_or_else(|| "UNKNOWN".into()),
        "backends": found.as_ref().map(|d| d.backends.clone()).unwrap_or_default(),
        "sources": {
            "flatbed": found.as_ref().map(|d| d.capabilities.flatbed).unwrap_or(false),
            "adf":     found.as_ref().map(|d| d.capabilities.adf).unwrap_or(false),
            "duplex":  found.as_ref().map(|d| d.capabilities.duplex).unwrap_or(false),
        },
        "status": found.as_ref().map(|d| d.status.clone()).unwrap_or_else(|| "unknown".into()),
        "statusDetails": found.as_ref().map(|d| d.status_details.clone()).unwrap_or_default(),
    });

    // For WIA devices, probe true capabilities through the bridge to refresh.
    #[cfg(target_os = "windows")]
    if let Some(d) = found.as_ref() {
        if let Some(wia_id) = &d.wia_id {
            if let Ok(mut session) = crate::bridge::spawn() {
                let cmd = serde_json::json!({ "cmd": "capabilities", "deviceId": wia_id }).to_string();
                if let Ok(lines) = session.command(&cmd) {
                    for line in lines {
                        if let Some(caps) = line.get("capabilities") {
                            result["capabilities"] = json!({
                                "flatbed": caps["hasFlatbed"].as_bool().unwrap_or(true),
                                "adf":     caps["hasAdf"].as_bool().unwrap_or(false),
                                "duplex":  caps["hasDuplex"].as_bool().unwrap_or(false),
                                "supportedDpi": caps["resolutions"].as_array().cloned().unwrap_or_else(|| vec![150.into(), 300.into(), 600.into()]),
                            });
                            result["sources"] = json!({
                                "flatbed": caps["hasFlatbed"].as_bool().unwrap_or(true),
                                "adf":     caps["hasAdf"].as_bool().unwrap_or(false),
                                "duplex":  caps["hasDuplex"].as_bool().unwrap_or(false),
                            });
                            result["backend"] = json!("WIA");
                            break;
                        } else if line.get("event").and_then(|e| e.as_str()) == Some("error") {
                            result["status"] = json!("error");
                            result["statusDetails"] = json!(line["message"].as_str().unwrap_or("WIA-Verbindung fehlgeschlagen"));
                        }
                    }
                }
            }
        }
    }

    let mut res = HttpResponse::Ok().json(result);
    let mut hm = std::mem::take(res.headers_mut());
    cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
    *res.headers_mut() = hm;
    res
}

// ── GET /diagnostics ─────────────────────────────────────────────────────────
async fn diagnostics(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    cache: web::Data<DeviceCache>,
) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed { return reject_forbidden(); }
    let allowed_origins = config.allowed_origins.clone();
    let connector_id = config.connector_id.clone();
    drop(config);

    let devices = cache.read().await.clone();

    let payload = json!({
        "connector": {
            "version": env!("CARGO_PKG_VERSION"),
            "platform": std::env::consts::OS,
            "port": 48281,
            "connectorId": connector_id,
            "connected": true,
            "bridgePresent": crate::bridge::bridge_path().is_some(),
        },
        "discovery": {
            "deviceCount": devices.len(),
        },
        "bridgePresent": crate::bridge::bridge_path().is_some(),
        "devices": devices.iter().map(|d| json!({
            "id": d.id,
            "name": d.display_name,
            "backend": d.backend,
            "backends": d.backends,
            "status": d.status,
            "statusDetails": d.status_details,
            "capabilities": {
                "flatbed": d.capabilities.flatbed,
                "adf": d.capabilities.adf,
                "duplex": d.capabilities.duplex,
            },
        })).collect::<Vec<_>>(),
    });

    let mut res = HttpResponse::Ok().json(payload);
    let mut hm = std::mem::take(res.headers_mut());
    cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
    *res.headers_mut() = hm;
    res
}

// ── POST /scan (synchronous) ─────────────────────────────────────────────────
async fn sync_scan(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    cache: web::Data<DeviceCache>,
    body: web::Json<scan::ScanOptions>,
) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed { return reject_forbidden(); }
    let allowed_origins = config.allowed_origins.clone();
    drop(config);

    let result = scan::execute_scan(body.into_inner(), cache.get_ref()).await;
    match result {
        Ok(pages) => {
            let mut res = HttpResponse::Ok().json(json!({ "pages": pages }));
            let mut hm = std::mem::take(res.headers_mut());
            cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
            *res.headers_mut() = hm;
            res
        }
        Err(e) => {
            let mut res = HttpResponse::BadRequest().json(json!({ "error": e, "message": e }));
            let mut hm = std::mem::take(res.headers_mut());
            cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
            *res.headers_mut() = hm;
            res
        }
    }
}

// ── POST /scan/job ───────────────────────────────────────────────────────────
async fn scan_job(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    cache: web::Data<DeviceCache>,
    jobs: web::Data<SharedJobs>,
    registry: web::Data<JobRegistry>,
    body: web::Json<scan::ScanOptions>,
) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed { return reject_forbidden(); }
    let allowed_origins = config.allowed_origins.clone();
    drop(config);

    let opts = body.into_inner();
    match scan::jobs::start_job(opts, cache.get_ref().clone(), jobs.get_ref(), registry.get_ref()).await {
        Ok(job_id) => {
            let mut res = HttpResponse::Accepted().json(json!({ "jobId": job_id }));
            let mut hm = std::mem::take(res.headers_mut());
            cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
            *res.headers_mut() = hm;
            res
        }
        Err(e) => {
            let mut res = HttpResponse::BadRequest().json(json!({ "error": e, "message": e }));
            let mut hm = std::mem::take(res.headers_mut());
            cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
            *res.headers_mut() = hm;
            res
        }
    }
}

// ── GET /scan/{id}/status ────────────────────────────────────────────────────
async fn scan_status(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    jobs: web::Data<SharedJobs>,
    path: web::Path<String>,
) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed { return reject_forbidden(); }
    let allowed_origins = config.allowed_origins.clone();
    drop(config);

    let id = path.into_inner();
    let state = jobs.read().await.get(&id).cloned();
    let res = if let Some(st) = state {
        let s = st.read().await;
        json!({
            "jobId": s.id,
            "status": s.status,
            "message": s.message,
            "pageCount": s.page_count,
            "pages": s.pages,
            "error": s.error,
        })
    } else {
        json!({ "jobId": id, "status": "NOT_FOUND", "message": "Unbekannter Scanauftrag" })
    };

    let mut http_res = HttpResponse::Ok().json(res);
    let mut hm = std::mem::take(http_res.headers_mut());
    cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
    *http_res.headers_mut() = hm;
    http_res
}

// ── POST /scan/{id}/cancel ───────────────────────────────────────────────────
async fn scan_cancel(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    jobs: web::Data<SharedJobs>,
    registry: web::Data<JobRegistry>,
    path: web::Path<String>,
) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, allowed) = origin_status(&req, &config);
    if !allowed { return reject_forbidden(); }
    let allowed_origins = config.allowed_origins.clone();
    drop(config);

    let id = path.into_inner();
    let cancelled = scan::jobs::cancel_job(&id, registry.get_ref()).await;
    // Also mark the job state as cancelled so status polls reflect it.
    if let Some(st) = jobs.read().await.get(&id).cloned() {
        let mut s = st.write().await;
        if s.status == scan::jobs::JobStatus::Scanning && cancelled {
            s.status = scan::jobs::JobStatus::Cancelled;
            s.message = "Scan abgebrochen".to_string();
        }
    }

    let mut res = HttpResponse::Ok().json(json!({
        "cancelled": cancelled,
        "jobId": id,
        "status": "CANCELLED"
    }));
    let mut hm = std::mem::take(res.headers_mut());
    cors_headers(&mut hm, origin.as_deref(), &allowed_origins);
    *res.headers_mut() = hm;
    res
}

// ── OPTIONS (CORS preflight) ─────────────────────────────────────────────────
async fn preflight(req: HttpRequest, cfg: web::Data<SharedConfig>) -> HttpResponse {
    let config = cfg.read().await;
    let (origin, _allowed) = origin_status(&req, &config);
    let mut res = HttpResponse::NoContent().finish();
    let mut hm = std::mem::take(res.headers_mut());
    cors_headers(&mut hm, origin.as_deref(), &config.allowed_origins);
    *res.headers_mut() = hm;
    res
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}", secs)
}

/// Start the HTTP API server. Blocks forever.
pub async fn start_server(cfg: SharedConfig, cache: DeviceCache) {
    let port = { cfg.read().await.port };
    let (jobs, registry): (SharedJobs, JobRegistry) = scan::jobs::new_registry();

    log::info!("LogiFlow Connector HTTP API listening on 127.0.0.1:{}", port);

    let cache_init = cache.clone();
    tokio::spawn(async move {
        let devices = discovery::run_discovery().await;
        let mut c = cache_init.write().await;
        *c = devices;
        log::info!("Initial discovery completed.");
    });

    HttpServer::new(move || {
        App::new()
            .wrap(middleware::Logger::default())
            .app_data(web::Data::new(cfg.clone()))
            .app_data(web::Data::new(cache.clone()))
            .app_data(web::Data::new(jobs.clone()))
            .app_data(web::Data::new(registry.clone()))
            .route("/health",   web::get().to(health))
            .route("/health",   web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/devices",  web::get().to(get_devices))
            .route("/devices",  web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/scanners", web::get().to(get_devices))
            .route("/scanners", web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/discover", web::post().to(force_discover))
            .route("/discover", web::get().to(force_discover))
            .route("/scanners/discover", web::post().to(force_discover))
            .route("/scanners/discover", web::get().to(force_discover))
            .route("/connect",  web::post().to(connect_device))
            .route("/connect",  web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/diagnostics", web::get().to(diagnostics))
            .route("/diagnostics", web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/scan",     web::post().to(sync_scan))
            .route("/scan",     web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/scan/job", web::post().to(scan_job))
            .route("/scan/job", web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/scan/{id}/status", web::get().to(scan_status))
            .route("/scan/{id}/status", web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/scan/{id}/cancel", web::post().to(scan_cancel))
            .route("/scan/{id}/cancel", web::method(actix_web::http::Method::OPTIONS).to(preflight))
    })
    .bind(("127.0.0.1", port))
    .expect("Cannot bind to 127.0.0.1:48281 — port may be in use")
    .run()
    .await
    .expect("HTTP server error");
}
