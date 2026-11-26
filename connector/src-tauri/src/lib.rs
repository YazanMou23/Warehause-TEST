#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod auth;
pub mod bridge;
pub mod config;
pub mod discovery;
pub mod scan;
pub mod server;

use std::sync::Arc;
use tokio::sync::RwLock;

use tauri::{
    Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};
use tauri_plugin_autostart::MacosLauncher;

use config::ConnectorConfig;
use discovery::types::DiscoveredDevice;

pub type SharedConfig  = Arc<RwLock<ConnectorConfig>>;
pub type DeviceCache   = Arc<RwLock<Vec<DiscoveredDevice>>>;

/// Log to stderr and, when possible, to a file the user can send for support:
/// %LOCALAPPDATA%\\LogiFlow Connector\\connector.log (or the temp dir).
fn init_logging() {
    let mut builder = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"));
    let dir = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("LogiFlow Connector");
    if std::fs::create_dir_all(&dir).is_ok() {
        let path = dir.join("connector.log");
        // Keep the file small: start fresh when it is over 1 MB.
        if std::fs::metadata(&path).map(|m| m.len() > 1_000_000).unwrap_or(false) {
            let _ = std::fs::remove_file(&path);
        }
        if let Ok(f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            builder.target(env_logger::Target::Pipe(Box::new(f)));
        }
    }
    builder.format_timestamp_secs();
    let _ = builder.try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Load or create connector config
            let cfg = ConnectorConfig::load_or_create();
            let shared_cfg: SharedConfig = Arc::new(RwLock::new(cfg));
            let device_cache: DeviceCache = Arc::new(RwLock::new(vec![]));

            // Resolve the bundled WIA bridge from Tauri's resource dir so scan
            // works in packaged (NSIS) installs, not just dev builds.
            #[cfg(target_os = "windows")]
            {
                let found = app.path().resource_dir().ok().and_then(|res| {
                    let direct = res.join(bridge::BRIDGE_EXE);
                    if direct.exists() { return Some(direct); }
                    let nested = res.join("resources").join(bridge::BRIDGE_EXE);
                    if nested.exists() { return Some(nested); }
                    None
                });
                if let Some(p) = &found {
                    log::info!("WIA bridge resource resolved to {}", p.display());
                }
                bridge::init_installed_path(found);
            }

            app.manage(shared_cfg.clone());
            app.manage(device_cache.clone());

            // Start the HTTP API server in a background thread
            let cfg_clone   = shared_cfg.clone();
            let cache_clone = device_cache.clone();
            std::thread::spawn(move || {
                let sys = actix_rt::System::new();
                sys.block_on(server::start_server(cfg_clone, cache_clone));
            });

            // System tray
            let quit_item   = MenuItemBuilder::with_id("quit",   "Beenden").build(app)?;
            let status_item = MenuItemBuilder::with_id("status", "LogiFlow Connector v3.0 — Aktiv").build(app)?;
            let sep_item    = MenuItemBuilder::with_id("sep",    "──────────────────────").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&status_item)
                .item(&sep_item)
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => { app.exit(0); }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LogiFlow Connector");
}
