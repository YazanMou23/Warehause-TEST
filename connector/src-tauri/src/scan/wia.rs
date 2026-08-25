use super::ScannedPage;
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use std::path::PathBuf;

pub async fn wia_scan() -> Result<Vec<ScannedPage>, String> {
    let temp_path = std::env::temp_dir().join(format!("logiflow_scan_{}.jpg", timestamp()));

    let script = format!(
        r#"try {{
          $dm = New-Object -ComObject WIA.DeviceManager
          if ($dm.DeviceInfos.Count -gt 0) {{
            $dev  = $dm.DeviceInfos.Item(1).Connect()
            $item = $dev.Items.Item(1)
            $img  = $item.Transfer()
            $img.SaveFile("{}")
          }} else {{ exit 1 }}
        }} catch {{ exit 2 }}"#,
        temp_path.to_string_lossy().replace('\', "\\")
    );

    let result = tokio::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .await
        .map_err(|e| format!("WIA PowerShell error: {}", e))?;

    if !result.status.success() {
        return Err("WIA scan failed — is a scanner connected?".into());
    }

    if !temp_path.exists() {
        return Err("WIA scan produced no output file.".into());
    }

    let bytes = std::fs::read(&temp_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&temp_path);

    Ok(vec![ScannedPage {
        page_number: 1,
        mime_type:   "image/jpeg".into(),
        base64_data: B64.encode(&bytes),
    }])
}

fn timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
