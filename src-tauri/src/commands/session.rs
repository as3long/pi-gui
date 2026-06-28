use crate::rpc::protocol::*;

/// Create a new session (async).
#[tauri::command]
pub async fn pi_new_session(
    state: tauri::State<'_, crate::state::AppState>,
    parent_session: Option<String>,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let mut cmd = NewSessionCommand::new("new-session");
    cmd.parent_session = parent_session;
    rpc.send_command(&RpcCommand::NewSession(cmd))
}

/// Switch to a different session (async).
#[tauri::command]
pub async fn pi_switch_session(
    state: tauri::State<'_, crate::state::AppState>,
    session_path: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = SwitchSessionCommand::new("switch-session", session_path);
    rpc.send_command(&RpcCommand::SwitchSession(cmd))
}

/// Fork the current session at a specific entry (async).
#[tauri::command]
pub async fn pi_fork(
    state: tauri::State<'_, crate::state::AppState>,
    entry_id: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = ForkCommand::new("fork", entry_id);
    rpc.send_command(&RpcCommand::Fork(cmd))
}
