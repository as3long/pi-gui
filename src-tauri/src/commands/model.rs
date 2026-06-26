use crate::rpc::client::find_pi as find_pi_binary;
use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::{AppHandle, State};

/// Switch to a specific model.
#[tauri::command]
pub fn pi_set_model(
    state: State<'_, AppState>,
    app: AppHandle,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    eprintln!(
        "[PiGUI] pi_set_model called: provider={}, model_id={}",
        provider, model_id
    );
    // For models with ':' (e.g. OpenRouter's qwen/qwen3-coder:free),
    // pi's RPC parses ':' as thinking level. Restart with --model flag.
    if model_id.contains(':') {
        let full_model = format!("{}/{}", provider, model_id);
        eprintln!(
            "[PiGUI] Model with colon, restarting pi with --model: {}",
            full_model
        );
        let cwd = std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
        rpc.kill();
        rpc.spawn_with_model(&cwd, app, Some(&full_model))?;
        return Ok(());
    }

    // Normal RPC approach for standard models
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SetModel(SetModelCommand::new("set-model", provider, model_id));
    eprintln!(
        "[PiGUI] Sending set_model command: {:?}",
        serde_json::to_string(&cmd).unwrap_or_default()
    );
    rpc.send_command(&cmd)
}

/// Cycle to the next available model.
#[tauri::command]
pub fn pi_cycle_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::CycleModel(CycleModelCommand::new("cycle-model"));
    rpc.send_command(&cmd)
}

/// Get available models by running `pi --list-models`
#[tauri::command]
pub fn pi_get_available_models() -> Result<serde_json::Value, String> {
    // Find pi binary
    let pi_path = find_pi_binary().ok_or("pi binary not found")?;

    eprintln!("[PiGUI] Running: {} --list-models", pi_path);

    let mut cmd = std::process::Command::new(&pi_path);
    cmd.arg("--list-models");

    // Windows-specific: hide console window
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }

    eprintln!(
        "[PiGUI] Working directory for pi --list-models: {:?}",
        std::env::current_dir()
    );

    let output = cmd.output().map_err(|e| {
        let msg = format!("Failed to run pi --list-models: {}. pi path: {}", e, pi_path);
        eprintln!("[PiGUI] {}", msg);
        msg
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!(
            "pi --list-models failed (exit code {:?}): {}",
            output.status.code(),
            stderr
        );
        eprintln!("[PiGUI] {}", msg);
        return Err(msg);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    eprintln!("[PiGUI] pi --list-models stdout length: {}", stdout.len());
    let mut models = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        // Skip header line and empty lines
        if line.is_empty() || line.starts_with("provider") || line.starts_with("---") {
            continue;
        }

        // Parse line: provider  model  context  max-out  thinking  images
        // Column indices: 0=provider, 1=model, 2=context, 3=max-out, 4=thinking, 5=images
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let provider = parts[0].to_string();
            let model_id = parts[1].to_string();
            let reasoning = parts.get(4).map(|&s| s == "yes").unwrap_or(false);

            models.push(serde_json::json!({
                "id": model_id,
                "name": model_id,
                "provider": provider,
                "reasoning": reasoning,
            }));
        }
    }

    eprintln!("[PiGUI] Found {} models", models.len());
    Ok(serde_json::json!(models))
}

/// Set thinking level.
#[tauri::command]
pub fn pi_set_thinking_level(state: State<'_, AppState>, level: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SetThinkingLevel(SetThinkingLevelCommand::new("set-thinking", level));
    rpc.send_command(&cmd)
}
