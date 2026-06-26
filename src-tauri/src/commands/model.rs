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
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::SetModel(SetModelCommand::new("set-model", provider, model_id));
    rpc.send_command(&cmd)
}

/// Cycle to the next available model (async).
#[tauri::command]
pub async fn pi_cycle_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::CycleModel(CycleModelCommand::new("cycle-model"));
    rpc.send_command(&cmd)
}

/// Get list of available models (async).
/// 
/// This calls the actual `pi --list-models` command directly
/// instead of going through the RPC channel for faster response.
#[tauri::command]
pub async fn pi_get_available_models() -> Result<Vec<serde_json::Value>, String> {
    use std::process::Command;
    
    // Find pi binary
    let pi_path = super::config::find_pi_binary()?;
    
    eprintln!("[PiGUI] Getting models from: {}", pi_path);
    
    // Get working directory
    let cwd = env::current_dir()
        .map_err(|e| format!("Failed to get current dir: {}", e))?;
    
    // Spawn pi --list-models
    let output = if pi_path.ends_with(".ps1") {
        Command::new("powershell.exe")
            .args(&["-ExecutionPolicy", "Bypass", "-File", &pi_path, "--list-models"])
            .current_dir(cwd)
            .output()
    } else {
        Command::new(&pi_path)
            .arg("--list-models")
            .current_dir(cwd)
            .output()
    }.map_err(|e| format!("Failed to execute pi --list-models: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pi --list-models failed: {}", stderr));
    }
    
    // Parse JSON output
    let stdout = String::from_utf8_lossy(&output.stdout);
    let models: Vec<serde_json::Value> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse models JSON: {}", e))?;
    
    eprintln!("[PiGUI] Found {} models", models.len());
    
    Ok(models)
}

/// Set thinking level (async).
#[tauri::command]
pub async fn pi_set_thinking_level(
    state: State<'_, AppState>,
    level: String,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::SetThinkingLevel(SetThinkingLevelCommand::new("set-thinking", level));
    rpc.send_command(&cmd)
}
