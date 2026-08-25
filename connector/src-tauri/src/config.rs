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
            allowed_origins: vec![
                "https://app.logiflow.de".into(),
                "http://localhost:3000".into(),
                "http://localhost:3001".into(),
            ],
            auth_secret: String::new(),
        }
    }
}

impl ConnectorConfig {
    pub fn config_path() -> PathBuf {
        let base = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."));
        base.join("LogiFlowConnector").join("config.json")
    }

    pub fn load_or_create() -> Self {
        let path = Self::config_path();
        if path.exists() {
            if let Ok(data) = fs::read_to_string(&path) {
                if let Ok(cfg) = serde_json::from_str::<Self>(&data) {
                    log::info!("Loaded config from {:?}", path);
                    return cfg;
                }
            }
        }
        let cfg = Self::default();
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
