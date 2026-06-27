
use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::State;

/// Create a new session (async).
#[tauri::command]
pub async fn pi_new_session(
    state: State<'_, AppState>,
    parent_session: Option<String>,
) -> Result<(), String> {
    let mut rpc = match tokio::time::timeout(
                std::time::Duration::from_millis(100),
                state.rpc.lock()
            ).await {
                Ok(rpc) => rpc,
                _ => return Err("Lock timeout".to_string()),
            };
    let mut cmd = NewSessionCommand::new("new-session");
    cmd.parent_session = parent_session;
    rpc.send_command(&RpcCommand::NewSession(cmd))
}

/// Switch to a different session (async).
#[tauri::command]
pub async fn pi_switch_session(
    state: State<'_, AppState>,
    session_path: String,
) -> Result<(), String> {
    let mut rpc = match tokio::time::timeout(
                std::time::Duration::from_millis(100),
                state.rpc.lock()
            ).await {
                Ok(rpc) => rpc,
                _ => return Err("Lock timeout".to_string()),
            };
    let cmd = SwitchSessionCommand::new("switch-session", session_path);
    rpc.send_command(&RpcCommand::SwitchSession(cmd))
}

/// Fork the current session at a specific entry (async).
#[tauri::command]
pub async fn pi_fork(
    state: State<'_, AppState>,
    entry_id: String,
) -> Result<(), String> {
    let mut rpc = match tokio::time::timeout(
                std::time::Duration::from_millis(100),
                state.rpc.lock()
            ).await {
                Ok(rpc) => rpc,
                _ => return Err("Lock timeout".to_string()),
            };
    let cmd = ForkCommand::new("fork", entry_id);
    rpc.send_command(&RpcCommand::Fork(cmd))
}
