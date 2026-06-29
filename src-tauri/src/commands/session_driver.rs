use crate::rpc::protocol::*;
use serde_json::Value;

/// Create a new session (session driver API).
#[tauri::command]
pub async fn pi_create_session(workspace: Value, options: Option<Value>) -> Result<Value, String> {
    // TODO: Implement full session driver
    Ok(serde_json::json!({
        "id": format!("session-{}", uuid::Uuid::new_v4()),
        "workspace": workspace,
        "createdAt": chrono::Utc::now().to_rfc3339(),
        "options": options,
    }))
}

/// Open an existing session (session driver API).
#[tauri::command]
pub async fn pi_open_session(session_ref: Value) -> Result<Value, String> {
    Ok(serde_json::json!({
        "success": true,
        "sessionRef": session_ref,
    }))
}

/// Archive a session (session driver API).
#[tauri::command]
pub async fn pi_archive_session(_session_ref: Value) -> Result<(), String> {
    Ok(())
}

/// Unarchive a session (session driver API).
#[tauri::command]
pub async fn pi_unarchive_session(_session_ref: Value) -> Result<(), String> {
    Ok(())
}

/// Send user message to a session (session driver API).
#[tauri::command]
pub async fn pi_send_user_message(
    state: tauri::State<'_, crate::state::AppState>,
    _session_ref: Value,
    input: Value,
) -> Result<(), String> {
    let message = input
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::Prompt(PromptCommand::new("session-prompt", message));
    rpc.send_command(&cmd)
}

/// Cancel currently running operation in session (session driver API).
#[tauri::command]
pub async fn pi_cancel_current_run(
    state: tauri::State<'_, crate::state::AppState>,
    _session_ref: Value,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::Abort(AbortCommand::new("session-abort"));
    rpc.send_command(&cmd)
}

/// Set model for a specific session (session driver API).
#[tauri::command]
pub async fn pi_set_session_model(
    state: tauri::State<'_, crate::state::AppState>,
    _session_ref: Value,
    selection: Value,
) -> Result<(), String> {
    let provider = selection
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let model_id = selection
        .get("modelId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::SetModel(SetModelCommand::new(
        "session-set-model",
        provider,
        model_id,
    ));
    rpc.send_command(&cmd)
}

/// Set thinking level for a session (session driver API).
#[tauri::command]
pub async fn pi_set_session_thinking_level(
    state: tauri::State<'_, crate::state::AppState>,
    _session_ref: Value,
    thinking_level: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::SetThinkingLevel(SetThinkingLevelCommand::new(
        "session-thinking",
        thinking_level,
    ));
    rpc.send_command(&cmd)
}

/// Rename a session (session driver API).
#[tauri::command]
pub async fn pi_rename_session(_session_ref: Value, _title: String) -> Result<(), String> {
    Ok(())
}

/// Compact session history (session driver API).
#[tauri::command]
pub async fn pi_compact_session(
    state: tauri::State<'_, crate::state::AppState>,
    _session_ref: Value,
    _custom_instructions: Option<String>,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let cmd = RpcCommand::Compact(CompactCommand::new("compact"));
    rpc.send_command(&cmd)
}

/// Reload session from disk (session driver API).
#[tauri::command]
pub async fn pi_reload_session(_session_ref: Value) -> Result<(), String> {
    Ok(())
}

/// Get session tree structure (session driver API).
#[tauri::command]
pub async fn pi_get_session_tree(_session_ref: Value) -> Result<Value, String> {
    Ok(serde_json::json!({
        "roots": [],
        "leafId": null,
    }))
}

/// Navigate session tree to a specific node (session driver API).
#[tauri::command]
pub async fn pi_navigate_session_tree(
    _session_ref: Value,
    _target_id: String,
    _options: Option<Value>,
) -> Result<Value, String> {
    Ok(serde_json::json!({
        "cancelled": false,
    }))
}

/// Respond to host UI request (session driver API).
#[tauri::command]
pub async fn pi_respond_to_host_ui_request(
    state: tauri::State<'_, crate::state::AppState>,
    _session_ref: Value,
    response: Value,
) -> Result<(), String> {
    let id = response
        .get("requestId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let value = response
        .get("value")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let confirmed = response.get("confirmed").and_then(|v| v.as_bool());
    let cancelled = response.get("cancelled").and_then(|v| v.as_bool());

    let mut rpc = super::lock_rpc(&state).await?;
    let ui_response = ExtensionUiResponse {
        r#type: "extension_ui_response".into(),
        id,
        value,
        confirmed,
        cancelled,
    };
    rpc.send_extension_ui_response(&ui_response)
}

/// Close a session (session driver API).
#[tauri::command]
pub async fn pi_close_session(_session_ref: Value) -> Result<(), String> {
    Ok(())
}
