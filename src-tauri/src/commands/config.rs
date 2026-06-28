use dirs::home_dir;
use std::env;
use std::fs;
use std::path::PathBuf;
use tokio::fs as tokio_fs;

/// Find the pi binary in PATH or common locations.
/// 
/// This is a helper function used by multiple commands.
pub fn find_pi_binary() -> Result<String, String> {
    // Check PATH first - look for actual executables
    if let Ok(path) = env::var("PATH") {
        for dir in env::split_paths(&path) {
            // Check for pi.exe on Windows (highest priority)
            let candidate_exe = dir.join("pi.exe");
            if candidate_exe.exists() {
                return Ok(candidate_exe.to_string_lossy().to_string());
            }
            // Check for pi.cmd on Windows
            let candidate_cmd = dir.join("pi.cmd");
            if candidate_cmd.exists() {
                return Ok(candidate_cmd.to_string_lossy().to_string());
            }
        }
    }

    // Check fnm multishells directory (dynamic names)
    let local_app_data = env::var("LOCALAPPDATA").unwrap_or_default();
    let fnm_multishells = PathBuf::from(&local_app_data).join("fnm_multishells");
    if fnm_multishells.exists() {
        if let Ok(entries) = fs::read_dir(&fnm_multishells) {
            for entry in entries.flatten() {
                let dir = entry.path();
                if dir.is_dir() {
                    // Check for pi files in each subdirectory
                    for name in &["pi.exe", "pi.cmd", "pi.ps1"] {
                        let candidate = dir.join(name);
                        if candidate.exists() {
                            return Ok(candidate.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    // Check fnm node-versions directory for any installed version
    let home = home_dir().unwrap_or_default();
    let fnm_versions = home.join("AppData/Roaming/fnm/node-versions");
    if fnm_versions.exists() {
        if let Ok(entries) = fs::read_dir(&fnm_versions) {
            // Collect and sort by version (newest first) to prefer latest
            let mut versions: Vec<_> = entries.flatten()
                .filter(|e| e.path().is_dir())
                .collect();
            versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

            for entry in versions {
                let install_dir = entry.path().join("installation");
                for name in &["pi.cmd", "pi.exe", "pi.ps1", "pi"] {
                    let candidate = install_dir.join(name);
                    if candidate.exists() {
                        return Ok(candidate.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    // Fallback: check standard locations
    let fallback_paths = [
        "/usr/local/bin/pi",
        "/usr/bin/pi",
    ];

    for loc in &fallback_paths {
        let path = PathBuf::from(loc);
        if path.exists() {
            return Ok(loc.to_string());
        }
    }

    Err("pi not found. Please ensure pi-coding-agent is installed and available in PATH.".into())
}

/// Get agent settings (async with tokio).
#[tauri::command]
pub async fn pi_get_agent_settings() -> Result<serde_json::Value, String> {
    let config_path = get_config_path()?;
    
    // Check if file exists (blocking but fast for local filesystem)
    if !config_path.exists() {
        return Ok(serde_json::json!({}));
    }
    
    let content = tokio_fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read config: {}", e))?;
    
    let settings: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or_else(|_| serde_json::json!({}));
    
    Ok(settings)
}

/// Set agent settings (async with tokio).
#[tauri::command]
pub async fn pi_set_agent_settings(settings: serde_json::Value) -> Result<(), String> {
    let config_path = get_config_path()?;
    
    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        if let Err(e) = tokio_fs::create_dir_all(parent).await {
            tracing::warn!(?e, parent = %parent.display(), "Failed to create config parent directory");
        }
    }
    
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    tokio_fs::write(&config_path, content)
        .await
        .map_err(|e| format!("Failed to write config: {}", e))?;
    
    Ok(())
}

/// Get agent auth configuration (async with tokio).
#[tauri::command]
pub async fn pi_get_agent_auth() -> Result<serde_json::Value, String> {
    let auth_path = get_auth_path()?;
    
    if !auth_path.exists() {
        return Ok(serde_json::json!({}));
    }
    
    let content = tokio_fs::read_to_string(&auth_path)
        .await
        .map_err(|e| format!("Failed to read auth: {}", e))?;
    
    let auth: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or_else(|_| serde_json::json!({}));
    
    Ok(auth)
}

/// Set agent auth configuration (async with tokio).
#[tauri::command]
pub async fn pi_set_agent_auth(auth: serde_json::Value) -> Result<(), String> {
    let auth_path = get_auth_path()?;
    
    // Ensure parent directory exists
    if let Some(parent) = auth_path.parent() {
        if let Err(e) = tokio_fs::create_dir_all(parent).await {
            tracing::warn!(?e, parent = %parent.display(), "Failed to create config parent directory");
        }
    }
    
    let content = serde_json::to_string_pretty(&auth)
        .map_err(|e| format!("Failed to serialize auth: {}", e))?;
    
    tokio_fs::write(&auth_path, content)
        .await
        .map_err(|e| format!("Failed to write auth: {}", e))?;
    
    Ok(())
}

/// Get home directory path.
#[tauri::command]
pub fn pi_get_home_dir() -> Result<String, String> {
    home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get home directory".into())
}

/// Get config file path for pi agent settings.
fn get_config_path() -> Result<PathBuf, String> {
    let home = home_dir().ok_or_else(|| "Failed to get home directory".to_string())?;
    Ok(home.join(".pi").join("config.json"))
}

/// Get auth file path for pi agent credentials.
fn get_auth_path() -> Result<PathBuf, String> {
    let home = home_dir().ok_or_else(|| "Failed to get home directory".to_string())?;
    Ok(home.join(".pi").join("auth.json"))
}
