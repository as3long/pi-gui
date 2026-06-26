use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::State;

/// Send a prompt message to pi.
#[tauri::command]
pub fn pi_prompt(state: State<'_, AppState>, id: String, message: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Prompt(PromptCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Send a prompt with steer behavior (during streaming).
#[tauri::command]
pub fn pi_steer(state: State<'_, AppState>, id: String, message: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Steer(SteerCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Send a follow-up message (delivered after agent finishes).
#[tauri::command]
pub fn pi_follow_up(state: State<'_, AppState>, id: String, message: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::FollowUp(FollowUpCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Abort the current agent operation.
#[tauri::command]
pub fn pi_abort(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Abort(AbortCommand::new("abort"));
    rpc.send_command(&cmd)
}

/// Send extension UI response back to pi.
#[tauri::command]
pub fn pi_extension_ui_response(
    state: State<'_, AppState>,
    id: String,
    value: Option<String>,
    confirmed: Option<bool>,
    cancelled: Option<bool>,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let response = ExtensionUiResponse {
        r#type: "extension_ui_response".into(),
        id,
        value,
        confirmed,
        cancelled,
    };
    rpc.send_extension_ui_response(&response)
}
