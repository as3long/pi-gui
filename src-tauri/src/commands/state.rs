use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::State;

/// Get current session state.
#[tauri::command]
pub fn pi_get_state(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::GetState(GetStateCommand::new("get-state"));
    rpc.send_command(&cmd)
}

/// Get all messages in the conversation.
#[tauri::command]
pub fn pi_get_messages(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::GetMessages(GetMessagesCommand::new("get-messages"));
    rpc.send_command(&cmd)
}

/// Get session stats.
#[tauri::command]
pub fn pi_get_session_stats(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::GetSessionStats(GetSessionStatsCommand::new("session-stats"));
    rpc.send_command(&cmd)
}

/// List all available sessions.
#[tauri::command]
pub fn pi_list_sessions(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::ListSessions(ListSessionsCommand::new("list-sessions"));
    rpc.send_command(&cmd)
}
