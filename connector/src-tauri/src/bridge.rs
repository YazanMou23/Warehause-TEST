//! Locates and invokes the Windows WIA `ScannerBridge.exe` child process.
//!
//! The bridge is a small C# console application compiled to `ScannerBridge.exe`
//! and shipped as a Tauri resource (see `tauri.conf.json` -> `bundle.resources`).
//! It talks JSON-lines over stdin/stdout so this crate never has to touch WIA
//! COM directly (which is fragile from Rust).

use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::io::{BufRead, BufReader};
use std::sync::OnceLock;

/// Name of the compiled bridge executable.
pub const BRIDGE_EXE: &str = "ScannerBridge.exe";

/// Installed path resolved once at startup from Tauri's resource dir. This is
/// the authoritative location in packaged apps (NSIS installs place resources
/// under the app dir); callers fall back to heuristic search when unset.
static INSTALLED: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Record the bridge location resolved from Tauri's resource directory at
/// startup (windows only). A `None` value is still recorded so callers don't
/// repeat expensive lookups.
pub fn init_installed_path(path: Option<PathBuf>) {
    let _ = INSTALLED.set(path);
}

/// Resolve the absolute path to the bridge executable, trying the resource dir
/// resolved at startup first and then heuristic locations (dev / CI builds).
pub fn bridge_path() -> Option<PathBuf> {
    if let Some(found) = INSTALLED.get().and_then(|p| p.clone()) {
        return Some(found);
    }
    // 1. Relative to a copied resource next to the executable (dev / packaged
    //    NSIS layouts commonly copy resources next to the exe).
    let exe_dir = std::env::current_exe().ok()?.parent().map(Path::to_path_buf);
    if let Some(dir) = exe_dir {
        let p = dir.join(BRIDGE_EXE);
        if p.exists() { return Some(p); }
        // Next to the (renamed) app binary
        for name in ["logiflow-connector", "LogiFlow Connector"] {
            let candidate = dir.join(name).join(BRIDGE_EXE);
            if candidate.exists() { return Some(candidate); }
        }
    }

    // 2. In-repo resources folder relative to the crate root.
    let crate_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let p = crate_root.join("resources").join(BRIDGE_EXE);
    if p.exists() { return Some(p); }

    // 3. Tauri resource dir heuristic (dev `tauri dev`).
    let target_dir = crate_root.join("target");
    if let Ok(rd) = std::fs::read_dir(&target_dir) {
        for e in rd.flatten() {
            let candidate = e.path().join("resources").join(BRIDGE_EXE);
            if candidate.exists() { return Some(candidate); }
        }
    }

    None
}

/// Spawn the bridge once, in long-running stdin/stdout mode.
/// Callers must drive it through the returned `BridgeSession`.
pub fn spawn() -> Result<BridgeSession, String> {
    let path = bridge_path().ok_or_else(|| {
        "WIA ScannerBridge.exe not found. Die Windows-WIA-Bridge wurde nicht mitgeliefert.".to_string()
    })?;

    let mut child = Command::new(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("ScannerBridge konnte nicht gestartet werden: {}", e))?;

    let stdout = child.stdout.take().ok_or("no stdout")?;

    Ok(BridgeSession {
        child,
        stdout: BufReader::new(stdout),
    })
}

/// A running bridge child process: write one JSON command line, read one JSON
/// result line.
pub struct BridgeSession {
    child: Child,
    stdout: BufReader<ChildStdout>,
}

impl BridgeSession {
    /// Send a JSON command and read the matching responses until a terminal
    /// line (one that has `ok` or `event:error`, or is a top-level result).
    /// Returns a list of JSON lines produced for this command.
    pub fn command(&mut self, json: &str) -> Result<Vec<serde_json::Value>, String> {
        use std::io::Write;
        let stdin = self.child.stdin.as_mut().ok_or("no stdin")?;
        writeln!(stdin, "{}", json).map_err(|e| format!("bridge write failed: {}", e))?;
        stdin.flush().map_err(|e| e.to_string())?;

        // Collect all lines produced until we hit a terminal result line.
        let mut lines: Vec<serde_json::Value> = Vec::new();
        let mut buf = String::new();
        // Read loop with a helper guard: we read one line at a time.
        loop {
            buf.clear();
            let n = self.stdout.read_line(&mut buf).map_err(|e| format!("bridge read failed: {}", e))?;
            if n == 0 { break; }
            let trimmed = buf.trim();
            if trimmed.is_empty() { continue; }
            let val = serde_json::from_str::<serde_json::Value>(trimmed)
                .unwrap_or_else(|_| serde_json::json!({"raw": trimmed}));
            // Terminal detection: for discover/capabilities/ping the bridge
            // emits exactly one result line (with "devices"/"capabilities"/"ok")
            // or an "event":"error" line. Stop once that payload is seen.
            let terminal = val.get("devices").is_some()
                || val.get("capabilities").is_some()
                || val.get("ok").is_some()
                || val.get("event").and_then(|e| e.as_str()) == Some("error");
            lines.push(val);
            if terminal { break; }
        }
        Ok(lines)
    }
}

impl Drop for BridgeSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
