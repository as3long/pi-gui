use crate::rpc::protocol::*;

/// Get current session state (async).
#[tauri::command]
pub async fn pi_get_state(state: tauri::State<'_, crate::state::AppState>) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::GetState(GetStateCommand::new("get-state"));
    rpc.send_command(&cmd)
}

/// Get all messages in the conversation (async).
#[tauri::command]
pub async fn pi_get_messages(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::GetMessages(GetMessagesCommand::new("get-messages"));
    rpc.send_command(&cmd)
}

/// Get session stats (async).
///
/// This is called frequently by the UI for the status bar.
#[tauri::command]
pub async fn pi_get_session_stats(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::GetSessionStats(GetSessionStatsCommand::new("session-stats"));
    rpc.send_command(&cmd)
}

/// List all available sessions (async).
#[tauri::command]
pub async fn pi_list_sessions(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::ListSessions(ListSessionsCommand::new("list-sessions"));
    rpc.send_command(&cmd)
}
