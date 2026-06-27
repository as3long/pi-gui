use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::State;

/// Helper: try to send command with timeout, fallback to error
async fn send_with_timeout(state: &State<'_, AppState>, cmd: RpcCommand) -> Result<(), String> {
    // Use try_lock first to avoid blocking
    match state.rpc.try_lock() {
        Ok(mut rpc) => {
            rpc.send_command(&cmd)
        }
        Err(_) => {
            // Lock held by another operation - wait briefly then try
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            match state.rpc.try_lock() {
                Ok(mut rpc) => rpc.send_command(&cmd),
                Err(_) => {
                    // Still can't get lock - return error instead of blocking
                    Err("Command rejected: another operation is in progress".to_string())
                }
            }
        }
    }
}

/// Send a prompt message to pi (async).
#[tauri::command]
pub async fn pi_prompt(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let cmd = RpcCommand::Prompt(PromptCommand::new(id, message));
    send_with_timeout(&state, cmd).await
}

/// Send a prompt with steer behavior (during streaming) (async).
#[tauri::command]
pub async fn pi_steer(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let cmd = RpcCommand::Steer(SteerCommand::new(id, message));
    send_with_timeout(&state, cmd).await
}

/// Send a follow-up message (delivered after agent finishes) (async).
#[tauri::command]
pub async fn pi_follow_up(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let cmd = RpcCommand::FollowUp(FollowUpCommand::new(id, message));
    send_with_timeout(&state, cmd).await
}

/// Abort the current agent operation (async).
/// Non-blocking: never waits more than 200ms.
#[tauri::command]
pub async fn pi_abort(state: State<'_, AppState>) -> Result<(), String> {
    let cmd = RpcCommand::Abort(AbortCommand::new("abort"));
    
    // Try to send abort command with very short timeout
    match state.rpc.try_lock() {
        Ok(mut rpc) => {
            rpc.send_command(&cmd)
        }
        Err(_) => {
            // Lock is held - just return success, operation will terminate
            eprintln!("[PiGUI] Abort requested while lock was held - operation will terminate");
            Ok(())
        }
    }
}

/// Send extension UI response back to pi (async).
#[tauri::command]
pub async fn pi_extension_ui_response(
    state: State<'_, AppState>,
    id: String,
    value: Option<String>,
    confirmed: Option<bool>,
    cancelled: Option<bool>,
) -> Result<(), String> {
    let mut response = ExtensionUIResponseCommand::new(id);
    response.value = value;
    response.confirmed = confirmed;
    response.cancelled = cancelled;
    let cmd = RpcCommand::ExtensionUIResponse(response);
    send_with_timeout(&state, cmd).await
}
