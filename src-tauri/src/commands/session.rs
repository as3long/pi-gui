use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::State;

/// Start a new session.
#[tauri::command]
pub fn pi_new_session(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::NewSession(NewSessionCommand::new("new-session"));
    rpc.send_command(&cmd)
}

/// Switch to a different session file.
#[tauri::command]
pub fn pi_switch_session(state: State<'_, AppState>, session_path: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SwitchSession(SwitchSessionCommand::new("switch-session", session_path));
    rpc.send_command(&cmd)
}

/// Fork from a specific entry.
#[tauri::command]
pub fn pi_fork(state: State<'_, AppState>, entry_id: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Fork(ForkCommand::new("fork", entry_id));
    rpc.send_command(&cmd)
}

/// Read and parse a session JSONL file
#[tauri::command]
pub fn pi_read_session(path: String) -> Result<serde_json::Value, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let mut messages = Vec::new();
    let mut session_info = serde_json::json!({});

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) {
            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");

            match entry_type {
                "session" => {
                    session_info = entry.clone();
                }
                "model_change" => {
                    // Track model changes
                    if let Some(obj) = session_info.as_object_mut() {
                        if let (Some(provider), Some(model_id)) = (
                            entry.get("provider").and_then(|v| v.as_str()),
                            entry.get("modelId").and_then(|v| v.as_str()),
                        ) {
                            obj.insert(
                                "model".into(),
                                serde_json::json!({
                                    "provider": provider,
                                    "modelId": model_id,
                                }),
                            );
                        }
                    }
                }
                "message" => {
                    if let Some(msg) = entry.get("message") {
                        messages.push(msg.clone());
                    }
                }
                _ => {}
            }
        }
    }

    Ok(serde_json::json!({
        "session": session_info,
        "messages": messages,
        "messageCount": messages.len()
    }))
}
