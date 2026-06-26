use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::State;

/// Get current session state (async).
#[tauri::command]
pub async fn pi_get_state(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::GetState(GetStateCommand::new("get-state"));
    rpc.send_command(&cmd)
}

/// Get all messages in the conversation (async).
#[tauri::command]
pub async fn pi_get_messages(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::GetMessages(GetMessagesCommand::new("get-messages"));
    rpc.send_command(&cmd)
}

/// Get session stats (async).
/// 
/// This is called frequently by the UI for the status bar.
/// The async lock ensures UI remains responsive.
#[tauri::command]
pub async fn pi_get_session_stats(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::GetSessionStats(GetSessionStatsCommand::new("session-stats"));
    rpc.send_command(&cmd)
}

/// List all available sessions (async).
#[tauri::command]
pub async fn pi_list_sessions(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let cmd = RpcCommand::ListSessions(ListSessionsCommand::new("list-sessions"));
    rpc.send_command(&cmd)
}
