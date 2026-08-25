use actix_web::{
    web, App, HttpRequest, HttpResponse, HttpServer, middleware,
    dev::ServiceRequest,
    Error as ActixError,
};
use serde_json::json;
use std::time::Duration;

use crate::{SharedConfig, DeviceCache, auth::is_origin_allowed};
use crate::discovery;
use crate::scan;

/// Middleware: validate Origin header against allowlist
async fn origin_check(
    req: ServiceRequest,
    srv: actix_web::dev::Service<_>,
) -> Result<actix_web::dev::ServiceResponse, ActixError> {
    // OPTIONS pass-through for CORS preflight — we handle headers below
    if req.method() == actix_web::http::Method::OPTIONS {
        return srv.call(req).await;
    }
    srv.call(req).await
}

fn cors_headers(origin: Option<&str>, allowed_origins: &[String]) -> actix_web::http::header::HeaderMap {
    let mut map = actix_web::http::header::HeaderMap::new();
    let allowed = if let Some(o) = origin {
        if allowed_origins.iter().any(|a| a == o) { o.to_string() }
        else { "null".to_string() }
    } else {
        // No origin — tools like curl, allow it
        "http://localhost".to_string()
    };
    map.insert(
        actix_web::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        actix_web::http::header::HeaderValue::from_str(&allowed).unwrap(),
    );
    map.insert(
        actix_web::http::header::ACCESS_CONTROL_ALLOW_METHODS,
        actix_web::http::header::HeaderValue::from_static("GET, POST, OPTIONS"),
    );
    map.insert(
        actix_web::http::header::ACCESS_CONTROL_ALLOW_HEADERS,
        actix_web::http::header::HeaderValue::from_static("Content-Type, Authorization"),
    );
    map
}

// ── GET /health ──────────────────────────────────────────────────────────────
async fn health(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
) -> HttpResponse {
    let config = cfg.read().await;
    let origin = req.headers().get("origin").and_then(|v| v.to_str().ok());

    if !is_origin_allowed(origin, &config.allowed_origins) {
        return HttpResponse::Forbidden().json(json!({ "error": "Origin not allowed" }));
    }

    let mut res = HttpResponse::Ok().json(json!({
        "status":       "ok",
        "version":      "3.0.0",
        "platform":     std::env::consts::OS,
        "connectorId":  config.connector_id,
        "timestamp":    chrono_now(),
    }));
    add_cors_headers(&mut res, origin, &config.allowed_origins);
    res
}

// ── GET /devices  &  POST /discover ──────────────────────────────────────────
async fn get_devices(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    cache: web::Data<DeviceCache>,
) -> HttpResponse {
    let config = cfg.read().await;
    let origin = req.headers().get("origin").and_then(|v| v.to_str().ok());

    if !is_origin_allowed(origin, &config.allowed_origins) {
        return HttpResponse::Forbidden().json(json!({ "error": "Origin not allowed" }));
    }

    let devices = cache.read().await.clone();
    let mut res = HttpResponse::Ok().json(&devices);
    add_cors_headers(&mut res, origin, &config.allowed_origins);
    res
}

async fn force_discover(
    req: HttpRequest,
    cfg: web::Data<SharedConfig>,
    cache: web::Data<DeviceCache>,
) -> HttpResponse {
    let config = cfg.read().await;
    let origin = req.headers().get("origin").and_then(|v| v.to_str().ok());

    if !is_origin_allowed(origin, &config.allowed_origins) {
        return HttpResponse::Forbidden().json(json!({ "error": "Origin not allowed" }));
    }

    drop(config);

    // Trigger discovery and update cache
    let discovered = discovery::run_discovery().await;
    let mut c = cache.write().await;
    *c = discovered.clone();
    drop(c);

    let mut res = HttpResponse::Ok().json(&discovered);
    add_cors_headers(&mut res, req.headers().get("origin").and_then(|v| v.to_str().ok()), &cfg.read().await.allowed_origins);
    res
}

// ── OPTIONS (CORS preflight) ──────────────────────────────────────────────────
async fn preflight(req: HttpRequest, cfg: web::Data<SharedConfig>) -> HttpResponse {
    let config = cfg.read().await;
    let origin = req.headers().get("origin").and_then(|v| v.to_str().ok());
    let mut res = HttpResponse::NoContent().finish();
    add_cors_headers(&mut res, origin, &config.allowed_origins);
    res
}

fn add_cors_headers(res: &mut HttpResponse, origin: Option<&str>, allowed: &[String]) {
    use actix_web::http::header::*;
    let o = origin.and_then(|o| {
        if allowed.iter().any(|a| a == o) { Some(o.to_string()) } else { None }
    }).unwrap_or_else(|| "http://localhost".to_string());
    res.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_str(&o).unwrap());
    res.headers_mut().insert(ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, POST, OPTIONS"));
    res.headers_mut().insert(ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type, Authorization"));
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}", secs)
}

/// Start the HTTP API server. Blocks forever.
pub async fn start_server(cfg: SharedConfig, cache: DeviceCache) {
    let port = { cfg.read().await.port };

    log::info!("LogiFlow Connector HTTP API listening on 127.0.0.1:{}", port);

    // Kick off initial background discovery
    let cache_init = cache.clone();
    tokio::spawn(async move {
        let devices = discovery::run_discovery().await;
        let mut c = cache_init.write().await;
        *c = devices;
        log::info!("Initial discovery completed.");
    });

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(cfg.clone()))
            .app_data(web::Data::new(cache.clone()))
            .route("/health",   web::get().to(health))
            .route("/health",   web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/devices",  web::get().to(get_devices))
            .route("/devices",  web::method(actix_web::http::Method::OPTIONS).to(preflight))
            .route("/scanners", web::get().to(get_devices))
            .route("/discover", web::post().to(force_discover))
            .route("/discover", web::get().to(force_discover))
            .route("/scanners/discover", web::post().to(force_discover))
    })
    .bind(("127.0.0.1", port))
    .expect("Cannot bind to 127.0.0.1:48281 — port may be in use")
    .run()
    .await
    .expect("HTTP server error");
}
