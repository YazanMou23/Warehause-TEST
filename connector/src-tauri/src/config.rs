use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorConfig {
    /// Unique identity of this installation (persisted)
    pub connector_id: String,
    /// Port the HTTP API server listens on
    pub port: u16,
    /// Comma-separated list of allowed webapp origins for CORS
    pub allowed_origins: Vec<String>,
    /// Optional shared secret for HMAC auth (empty = no auth required)
    pub auth_secret: String,
}

impl Default for ConnectorConfig {
    fn default() -> Self {
        Self {
            connector_id:    Uuid::new_v4().to_string(),
            port:            48281,
            allowed_origins: Self::default_allowed_origins(),
            auth_secret: String::new(),
        }
    }
}

impl ConnectorConfig {
    /// Origins that the webapp may use to reach the local connector.
    /// Kept as the single source of truth so both new installs and upgrades
    /// converge on the same allowlist.
    pub fn default_allowed_origins() -> Vec<String> {
        vec![
            // Deployed web frontends
            "https://app.logiflow.de".into(),
            "https://warehause-test.vercel.app".into(),
            "https://warehause.vercel.app".into(),
            // Local dev
            "http://localhost:3000".into(),
            "http://localhost:3001".into(),
            "https://localhost:3000".into(),
            "http://127.0.0.1:3000".into(),
            "http://127.0.0.1:3001".into(),
        ]
    }

    pub fn config_path() -> PathBuf {
        let base = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."));
        base.join("LogiFlowConnector").join("config.json")
    }

    pub fn load_or_create() -> Self {
        let path = Self::config_path();
        let mut cfg = if path.exists() {
            if let Ok(data) = fs::read_to_string(&path) {
                if let Ok(mut cfg) = serde_json::from_str::<Self>(&data) {
                    // Migration: merge any newly-added default origins into an
                    // existing config so upgraded installs pick up the fix
                    // (e.g. the deployed Vercel origin that previously caused
                    //  "Install Connector" to be shown despite a valid install).
                    let defaults = Self::default_allowed_origins();
                    for d in defaults {
                        if !cfg.allowed_origins.iter().any(|o| o.eq_ignore_ascii_case(&d)) {
                            cfg.allowed_origins.push(d);
                        }
                    }
                    log::info!("Loaded config from {:?} ({} allowed origins)", path, cfg.allowed_origins.len());
                    return cfg;
                }
            }
            // Corrupt config — reset to defaults
            Self::default()
        } else {
            Self::default()
        };
        cfg.port = 48281; // ensure known port
        cfg.save();
        cfg
    }

    pub fn save(&self) {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = fs::write(&path, json);
            log::info!("Config saved to {:?}", path);
        }
    }
}
