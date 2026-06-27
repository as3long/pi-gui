
use crate::rpc::protocol::*;
use crate::state::AppState;
use std::env;
use tauri::State;

/// Set the current model (async).
#[tauri::command]
pub async fn pi_set_model(
    state: State<'_, AppState>,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    let mut rpc = match tokio::time::timeout(
                std::time::Duration::from_millis(100),
                state.rpc.lock()
            ).await {
                Ok(rpc) => rpc,
                _ => return Err("Lock timeout".to_string()),
            };
    let cmd = RpcCommand::SetModel(SetModelCommand::new("set-model", provider, model_id));
    rpc.send_command(&cmd)
}

/// Cycle to the next available model (async).
#[tauri::command]
pub async fn pi_cycle_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = match tokio::time::timeout(
                std::time::Duration::from_millis(100),
                state.rpc.lock()
            ).await {
                Ok(rpc) => rpc,
                _ => return Err("Lock timeout".to_string()),
            };
    let cmd = RpcCommand::CycleModel(CycleModelCommand::new("cycle-model"));
    rpc.send_command(&cmd)
}

/// Get list of available models (async).
/// 
/// This calls the actual `pi --list-models` command directly
/// instead of going through the RPC channel for faster response.
#[tauri::command]
pub async fn pi_get_available_models() -> Result<Vec<serde_json::Value>, String> {
    use tokio::process::Command;
    
    // Find pi binary
    let pi_path = super::config::find_pi_binary()?;
    
    eprintln!("[PiGUI] Getting models from: {}", pi_path);
    
    // Get working directory
    let cwd = env::current_dir()
        .map_err(|e| format!("Failed to get current dir: {}", e))?;
    
    // Spawn pi --list-models
    let mut cmd = if pi_path.ends_with(".ps1") {
        let mut c = Command::new("powershell.exe");
        c.args(&["-ExecutionPolicy", "Bypass", "-File", &pi_path, "--list-models"]);
        c
    } else {
        let mut c = Command::new(&pi_path);
        c.arg("--list-models");
        c
    };
    
    cmd.current_dir(cwd);
    
    // Hide console window on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    // Add timeout to avoid hanging (15 seconds)
    let output = match tokio::time::timeout(
        tokio::time::Duration::from_secs(15),
        cmd.kill_on_drop(true).output()
    ).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return Err(format!("Failed to execute pi --list-models: {}", e)),
        Err(_) => return Err("pi --list-models timed out after 15 seconds".to_string()),
    };
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pi --list-models failed: {}", stderr));
    }
    
    // Parse table format output (pi outputs human-readable table, not JSON)
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();
    
    for (idx, line) in stdout.lines().enumerate() {
        // Skip header line and empty lines
        if idx == 0 || line.trim().is_empty() {
            continue;
        }
        
        // Parse table columns: provider, model, context, max-out, thinking, images
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let provider = parts[0].to_string();
            let model_id = parts[1].to_string();
            
            // Check for thinking and images support
            let thinking = parts.iter().any(|&p| p == "yes");
            let has_images = parts.iter().filter(|&&p| p == "yes").count() >= 2;
            
            models.push(serde_json::json!({
                "id": model_id.clone(),
                "name": model_id,
                "provider": provider,
                "thinking": thinking,
                "images": has_images
            }));
        }
    }
    
    eprintln!("[PiGUI] Found {} models", models.len());
    
    Ok(models)
}

/// Set thinking level (async).
#[tauri::command]
pub async fn pi_set_thinking_level(
    state: State<'_, AppState>,
    level: String,
) -> Result<(), String> {
    let mut rpc = match tokio::time::timeout(
                std::time::Duration::from_millis(100),
                state.rpc.lock()
            ).await {
                Ok(rpc) => rpc,
                _ => return Err("Lock timeout".to_string()),
            };
    let cmd = RpcCommand::SetThinkingLevel(SetThinkingLevelCommand::new("set-thinking", level));
    rpc.send_command(&cmd)
}
