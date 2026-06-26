use crate::rpc::protocol::*;
use crate::state::AppState;
use tauri::State;

/// Session Driver Commands (placeholder implementations)

#[tauri::command]
pub fn pi_create_session(
    workspace: serde_json::Value,
    options: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let workspace_id = workspace["workspaceId"].as_str().unwrap_or("default");
    let session_id = uuid::Uuid::new_v4().to_string();

    let title = options
        .as_ref()
        .and_then(|o| o["title"].as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("Session {}", &session_id[..8]));

    let config = options.as_ref().and_then(|o| o.get("initialModel").cloned());

    Ok(serde_json::json!({
        "ref": {
            "workspaceId": workspace_id,
            "sessionId": session_id
        },
        "workspace": workspace,
        "title": title,
        "status": "idle",
        "updatedAt": chrono::Utc::now().to_rfc3339(),
        "config": config
    }))
}

#[tauri::command]
pub fn pi_open_session(session_ref: serde_json::Value) -> Result<serde_json::Value, String> {
    let session_id = session_ref["sessionId"].as_str().unwrap_or("");
    let workspace_id = session_ref["workspaceId"].as_str().unwrap_or("default");

    // Try to find and read the session file
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let sessions_dir = home_dir.join(".pi/agent/sessions");

    if let Ok(entries) = std::fs::read_dir(&sessions_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Ok(session_files) = std::fs::read_dir(entry.path()) {
                    for file in session_files.flatten() {
                        let file_name = file.file_name().to_string_lossy().to_string();
                        if file_name.contains(session_id) && file_name.ends_with(".jsonl") {
                            return Ok(serde_json::json!({
                                "ref": session_ref,
                                "workspace": {
                                    "workspaceId": workspace_id,
                                    "path": entry.path().to_string_lossy()
                                },
                                "title": file_name.split('_').next().unwrap_or(&file_name),
                                "status": "idle",
                                "updatedAt": chrono::Utc::now().to_rfc3339(),
                                "filePath": file.path().to_string_lossy()
                            }));
                        }
                    }
                }
            }
        }
    }

    Err(format!("Session {} not found", session_id))
}

#[tauri::command]
pub fn pi_archive_session(session_ref: serde_json::Value) -> Result<(), String> {
    // Placeholder: In real implementation, would mark session as archived
    println!("Archiving session: {:?}", session_ref);
    Ok(())
}

#[tauri::command]
pub fn pi_unarchive_session(session_ref: serde_json::Value) -> Result<(), String> {
    // Placeholder: In real implementation, would unmark session as archived
    println!("Unarchiving session: {:?}", session_ref);
    Ok(())
}

#[tauri::command]
pub fn pi_send_user_message(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
    input: serde_json::Value,
) -> Result<(), String> {
    let text = input["text"].as_str().unwrap_or("");
    let id = uuid::Uuid::new_v4().to_string();

    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Prompt(PromptCommand::new(id, text.to_string()));
    rpc.send_command(&cmd)
}

#[tauri::command]
pub fn pi_cancel_current_run(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Abort(AbortCommand::new("abort"));
    rpc.send_command(&cmd)
}

#[tauri::command]
pub fn pi_set_session_model(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
    selection: serde_json::Value,
) -> Result<(), String> {
    let provider = selection["provider"].as_str().unwrap_or("");
    let model_id = selection["modelId"].as_str().unwrap_or("");

    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd =
        RpcCommand::SetModel(SetModelCommand::new("set-model", provider.to_string(), model_id.to_string()));
    rpc.send_command(&cmd)
}

#[tauri::command]
pub fn pi_set_session_thinking_level(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
    thinking_level: String,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SetThinkingLevel(SetThinkingLevelCommand::new("set-thinking", thinking_level));
    rpc.send_command(&cmd)
}

#[tauri::command]
pub fn pi_rename_session(session_ref: serde_json::Value, title: String) -> Result<(), String> {
    // Placeholder: In real implementation, would rename the session
    println!("Renaming session {:?} to: {}", session_ref, title);
    Ok(())
}

#[tauri::command]
pub fn pi_compact_session(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
    custom_instructions: Option<String>,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Compact(CompactCommand::new("compact"));
    rpc.send_command(&cmd)
}

#[tauri::command]
pub fn pi_reload_session(session_ref: serde_json::Value) -> Result<(), String> {
    // Placeholder: In real implementation, would reload session from disk
    println!("Reloading session: {:?}", session_ref);
    Ok(())
}

#[tauri::command]
pub fn pi_get_session_tree(session_ref: serde_json::Value) -> Result<serde_json::Value, String> {
    // Placeholder: In real implementation, would parse session JSONL into tree
    let session_id = session_ref["sessionId"].as_str().unwrap_or("root");

    Ok(serde_json::json!({
        "roots": [{
            "id": session_id,
            "parentId": null,
            "kind": "session_info",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "title": "Session Start",
            "children": []
        }],
        "leafId": session_id
    }))
}

#[tauri::command]
pub fn pi_navigate_session_tree(
    session_ref: serde_json::Value,
    target_id: String,
    options: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    // Placeholder: In real implementation, would navigate to tree node
    Ok(serde_json::json!({
        "cancelled": false,
        "aborted": false
    }))
}

#[tauri::command]
pub fn pi_respond_to_host_ui_request(
    session_ref: serde_json::Value,
    response: serde_json::Value,
) -> Result<(), String> {
    // Placeholder: In real implementation, would send response back to pi
    println!("Responding to host UI request: {:?}", response);
    Ok(())
}

#[tauri::command]
pub fn pi_close_session(session_ref: serde_json::Value) -> Result<(), String> {
    // Placeholder: In real implementation, would close session
    println!("Closing session: {:?}", session_ref);
    Ok(())
}
