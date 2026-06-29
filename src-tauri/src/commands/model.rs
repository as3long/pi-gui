use crate::rpc::protocol::*;
use std::env;

/// Set the current model (async).
#[tauri::command]
pub async fn pi_set_model(
    state: tauri::State<'_, crate::state::AppState>,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::SetModel(SetModelCommand::new("set-model", provider, model_id));
    rpc.send_command(&cmd)
}

/// Cycle to the next available model (async).
#[tauri::command]
pub async fn pi_cycle_model(state: tauri::State<'_, crate::state::AppState>) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::CycleModel(CycleModelCommand::new("cycle-model"));
    rpc.send_command(&cmd)
}

/// Get list of available models (async).
///
/// This calls `pi --list-models` directly for faster response.
#[tauri::command]
pub async fn pi_get_available_models() -> Result<Vec<serde_json::Value>, String> {
    use tokio::process::Command;

    let pi_path = super::config::find_pi_binary()?;
    let cwd = env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;

    let mut cmd = if pi_path.ends_with(".ps1") {
        let mut c = Command::new("powershell.exe");
        c.args(&[
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &pi_path,
            "--list-models",
        ]);
        c
    } else {
        let mut c = Command::new(&pi_path);
        c.arg("--list-models");
        c
    };

    cmd.current_dir(cwd);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = match tokio::time::timeout(
        tokio::time::Duration::from_secs(15),
        cmd.kill_on_drop(true).output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return Err(format!("Failed to execute pi --list-models: {}", e)),
        Err(_) => return Err("pi --list-models timed out after 15 seconds".to_string()),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pi --list-models failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();

    for (idx, line) in stdout.lines().enumerate() {
        if idx == 0 || line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let provider = parts[0].to_string();
            let model_id = parts[1].to_string();
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

    tracing::info!("Found {} models", models.len());
    Ok(models)
}

/// Set thinking level (async).
#[tauri::command]
pub async fn pi_set_thinking_level(
    state: tauri::State<'_, crate::state::AppState>,
    level: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::SetThinkingLevel(SetThinkingLevelCommand::new("set-thinking", level));
    rpc.send_command(&cmd)
}
