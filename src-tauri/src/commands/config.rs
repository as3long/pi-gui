/// Read pi agent settings from ~/.pi/agent/settings.json
#[tauri::command]
pub fn pi_get_agent_settings() -> Result<serde_json::Value, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home_dir.join(".pi/agent/settings.json");

    if !settings_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Write pi agent settings to ~/.pi/agent/settings.json
#[tauri::command]
pub fn pi_set_agent_settings(settings: serde_json::Value) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home_dir.join(".pi/agent/settings.json");

    // Ensure parent directory exists
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    std::fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))
}

/// Read pi agent auth from ~/.pi/agent/auth.json
#[tauri::command]
pub fn pi_get_agent_auth() -> Result<serde_json::Value, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let auth_path = home_dir.join(".pi/agent/auth.json");

    if !auth_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = std::fs::read_to_string(&auth_path)
        .map_err(|e| format!("Failed to read auth: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse auth: {}", e))
}

/// Write pi agent auth to ~/.pi/agent/auth.json
#[tauri::command]
pub fn pi_set_agent_auth(auth: serde_json::Value) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let auth_path = home_dir.join(".pi/agent/auth.json");

    // Ensure parent directory exists
    if let Some(parent) = auth_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&auth)
        .map_err(|e| format!("Failed to serialize auth: {}", e))?;

    std::fs::write(&auth_path, content)
        .map_err(|e| format!("Failed to write auth: {}", e))
}

/// Get home directory path
#[tauri::command]
pub fn pi_get_home_dir() -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    Ok(home_dir.to_string_lossy().to_string())
}
