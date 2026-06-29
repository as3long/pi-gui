use crate::rpc::protocol::*;

/// Send a prompt message to pi (async).
#[tauri::command]
pub async fn pi_prompt(
    state: tauri::State<'_, crate::state::AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::Prompt(PromptCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Send a prompt with steer behavior (during streaming) (async).
#[tauri::command]
pub async fn pi_steer(
    state: tauri::State<'_, crate::state::AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::Steer(SteerCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Send a follow-up message (delivered after agent finishes) (async).
#[tauri::command]
pub async fn pi_follow_up(
    state: tauri::State<'_, crate::state::AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::FollowUp(FollowUpCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Abort the current agent operation (async).
#[tauri::command]
pub async fn pi_abort(state: tauri::State<'_, crate::state::AppState>) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::Abort(AbortCommand::new("abort"));
    rpc.send_command(&cmd)
}

/// Send extension UI response back to pi (async).
#[tauri::command]
pub async fn pi_extension_ui_response(
    state: tauri::State<'_, crate::state::AppState>,
    id: String,
    value: Option<String>,
    confirmed: Option<bool>,
    cancelled: Option<bool>,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let mut response = ExtensionUIResponseCommand::new(id);
    response.value = value;
    response.confirmed = confirmed;
    response.cancelled = cancelled;
    let cmd = RpcCommand::ExtensionUIResponse(response);
    rpc.send_command(&cmd)
}
