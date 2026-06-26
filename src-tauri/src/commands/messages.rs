use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::State;

/// Send a prompt message to pi (async).
/// 
/// The async Mutex guard ensures the runtime thread isn't blocked.
/// The lock is released immediately after writing to stdin.
#[tauri::command]
pub async fn pi_prompt(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::Prompt(PromptCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Send a prompt with steer behavior (during streaming) (async).
#[tauri::command]
pub async fn pi_steer(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::Steer(SteerCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Send a follow-up message (delivered after agent finishes) (async).
#[tauri::command]
pub async fn pi_follow_up(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::FollowUp(FollowUpCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Abort the current agent operation (async).
#[tauri::command]
pub async fn pi_abort(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::Abort(AbortCommand::new("abort"));
    rpc.send_command(&cmd)
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
    let mut rpc = state.rpc.lock().await;
    let response = ExtensionUiResponse {
        r#type: "extension_ui_response".into(),
        id,
        value,
        confirmed,
        cancelled,
    };
    rpc.send_extension_ui_response(&response)
}
