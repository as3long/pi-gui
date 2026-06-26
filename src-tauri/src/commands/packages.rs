use crate::rpc::client::find_pi as find_pi_binary;

/// Install a pi package (e.g., npm:pi-volcengine-provider)
#[tauri::command]
pub fn pi_install_package(source: String) -> Result<serde_json::Value, String> {
    let pi_path = find_pi_binary().ok_or("pi binary not found")?;

    eprintln!(
        "[PiGUI] Installing package: {} using pi at: {}",
        source, pi_path
    );

    let mut cmd = std::process::Command::new(&pi_path);
    cmd.arg("install").arg(&source);

    // Windows-specific: hide console window
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run pi install: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    eprintln!("[PiGUI] pi install stdout: {}", stdout);
    eprintln!("[PiGUI] pi install stderr: {}", stderr);

    if !output.status.success() {
        return Err(format!("Install failed: {}", stderr));
    }

    Ok(serde_json::json!({
        "success": true,
        "source": source,
        "stdout": stdout.to_string(),
        "stderr": stderr.to_string()
    }))
}

/// List installed packages from settings
#[tauri::command]
pub fn pi_list_packages() -> Result<Vec<String>, String> {
    // Read settings.json and extract packages list
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home_dir.join(".pi/agent/settings.json");

    if !settings_path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    let settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    let packages = settings
        .get("packages")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(packages)
}
