mod rpc;

use rpc::client::PiRpcClient;
use rpc::client::find_pi as find_pi_binary;
use rpc::protocol::*;
use std::sync::Mutex;
use tauri::{AppHandle, State};

// ── App State ──

struct AppState {
    rpc: Mutex<PiRpcClient>,
}

// ── Tauri Commands ──

/// Start the pi subprocess.
#[tauri::command]
fn pi_start(state: State<'_, AppState>, app: AppHandle, cwd: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    rpc.spawn(&cwd, app)
}

/// Stop the pi subprocess.
#[tauri::command]
fn pi_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    rpc.kill()
}

/// Check if pi is running.
#[tauri::command]
fn pi_is_running(state: State<'_, AppState>) -> Result<bool, String> {
    let rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    Ok(rpc.is_running())
}

/// Send a prompt message to pi.
#[tauri::command]
fn pi_prompt(state: State<'_, AppState>, id: String, message: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Prompt(PromptCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Send a prompt with steer behavior (during streaming).
#[tauri::command]
fn pi_steer(state: State<'_, AppState>, id: String, message: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Steer(SteerCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Send a follow-up message (delivered after agent finishes).
#[tauri::command]
fn pi_follow_up(state: State<'_, AppState>, id: String, message: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::FollowUp(FollowUpCommand::new(id, message));
    rpc.send_command(&cmd)
}

/// Abort the current agent operation.
#[tauri::command]
fn pi_abort(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Abort(AbortCommand::new("abort"));
    rpc.send_command(&cmd)
}

/// Get current session state.
#[tauri::command]
fn pi_get_state(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::GetState(GetStateCommand::new("get-state"));
    rpc.send_command(&cmd)
}

/// Get all messages in the conversation.
#[tauri::command]
fn pi_get_messages(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::GetMessages(GetMessagesCommand::new("get-messages"));
    rpc.send_command(&cmd)
}

/// Switch to a specific model.
#[tauri::command]
fn pi_set_model(state: State<'_, AppState>, app: AppHandle, provider: String, model_id: String) -> Result<(), String> {
    // For models with ':' (e.g. OpenRouter's qwen/qwen3-coder:free),
    // pi's RPC parses ':' as thinking level. Restart with --model flag.
    if model_id.contains(':') {
        let full_model = format!("{}/{}", provider, model_id);
        eprintln!("[PiGUI] Model with colon, restarting pi with --model: {}", full_model);
        let cwd = std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
        rpc.kill();
        rpc.spawn_with_model(&cwd, app, Some(&full_model))?;
        return Ok(());
    }
    
    // Normal RPC approach for standard models
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SetModel(SetModelCommand::new("set-model", provider, model_id));
    rpc.send_command(&cmd)
}

/// Cycle to the next available model.
#[tauri::command]
fn pi_cycle_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::CycleModel(CycleModelCommand::new("cycle-model"));
    rpc.send_command(&cmd)
}

/// Get available models by running `pi --list-models`
#[tauri::command]
fn pi_get_available_models() -> Result<serde_json::Value, String> {
    // Find pi binary
    let pi_path = find_pi_binary().ok_or("pi binary not found")?;
    
    eprintln!("[PiGUI] Running: {} --list-models", pi_path);
    
    let output = std::process::Command::new(&pi_path)
        .arg("--list-models")
        .output()
        .map_err(|e| format!("Failed to run pi --list-models: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pi --list-models failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();
    
    for line in stdout.lines() {
        let line = line.trim();
        // Skip header line and empty lines
        if line.is_empty() || line.starts_with("provider") || line.starts_with("---") {
            continue;
        }
        
        // Parse line: provider  model  context  max-out  thinking  images
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let provider = parts[0].to_string();
            let model_id = parts[1].to_string();
            // thinking is column 4 (0-indexed: 3)
            let reasoning = parts.get(3).map(|&s| s == "yes").unwrap_or(false);
            
            models.push(serde_json::json!({
                "id": model_id,
                "name": model_id,
                "provider": provider,
                "reasoning": reasoning,
            }));
        }
    }
    
    eprintln!("[PiGUI] Found {} models", models.len());
    Ok(serde_json::json!(models))
}

/// Set thinking level.
#[tauri::command]
fn pi_set_thinking_level(state: State<'_, AppState>, level: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SetThinkingLevel(SetThinkingLevelCommand::new("set-thinking", level));
    rpc.send_command(&cmd)
}

/// Start a new session.
#[tauri::command]
fn pi_new_session(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::NewSession(NewSessionCommand::new("new-session"));
    rpc.send_command(&cmd)
}

/// Switch to a different session file.
#[tauri::command]
fn pi_switch_session(state: State<'_, AppState>, session_path: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SwitchSession(SwitchSessionCommand::new("switch-session", session_path));
    rpc.send_command(&cmd)
}

/// Fork from a specific entry.
#[tauri::command]
fn pi_fork(state: State<'_, AppState>, entry_id: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Fork(ForkCommand::new("fork", entry_id));
    rpc.send_command(&cmd)
}

/// Get session stats.
#[tauri::command]
fn pi_get_session_stats(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::GetSessionStats(GetSessionStatsCommand::new("session-stats"));
    rpc.send_command(&cmd)
}

/// List all available sessions.
#[tauri::command]
fn pi_list_sessions(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::ListSessions(ListSessionsCommand::new("list-sessions"));
    rpc.send_command(&cmd)
}

/// Send extension UI response back to pi.
#[tauri::command]
fn pi_extension_ui_response(
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

/// Read pi agent settings from ~/.pi/agent/settings.json
#[tauri::command]
fn pi_get_agent_settings() -> Result<serde_json::Value, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home_dir.join(".pi/agent/settings.json");
    
    if !settings_path.exists() {
        return Ok(serde_json::json!({}));
    }
    
    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Write pi agent settings to ~/.pi/agent/settings.json
#[tauri::command]
fn pi_set_agent_settings(settings: serde_json::Value) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home_dir.join(".pi/agent/settings.json");
    
    // Ensure parent directory exists
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    std::fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))
}

/// Read pi agent auth from ~/.pi/agent/auth.json
#[tauri::command]
fn pi_get_agent_auth() -> Result<serde_json::Value, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let auth_path = home_dir.join(".pi/agent/auth.json");
    
    if !auth_path.exists() {
        return Ok(serde_json::json!({}));
    }
    
    let content = std::fs::read_to_string(&auth_path)
        .map_err(|e| format!("Failed to read auth: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse auth: {}", e))
}

/// Write pi agent auth to ~/.pi/agent/auth.json
#[tauri::command]
fn pi_set_agent_auth(auth: serde_json::Value) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let auth_path = home_dir.join(".pi/agent/auth.json");
    
    // Ensure parent directory exists
    if let Some(parent) = auth_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(&auth)
        .map_err(|e| format!("Failed to serialize auth: {}", e))?;
    
    std::fs::write(&auth_path, content)
        .map_err(|e| format!("Failed to write auth: {}", e))
}

/// Get home directory path
#[tauri::command]
fn pi_get_home_dir() -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    Ok(home_dir.to_string_lossy().to_string())
}

/// Delete a file or directory
#[tauri::command]
fn pi_delete_file(path: String) -> Result<(), String> {
    eprintln!("[PiGUI] Attempting to delete: {}", path);

    // On Windows, convert reserved device names (nul, con, aux, prn, com1-9, lpt1-9)
    // to use \\?\ prefix to bypass the OS-level name resolution
    #[cfg(target_os = "windows")]
    let fixed_path = {
        let p = std::path::Path::new(&path);
        if let Some(name) = p.file_name() {
            let name_str = name.to_string_lossy().to_lowercase();
            let reserved = ["nul", "con", "aux", "prn",
                "com1","com2","com3","com4","com5","com6","com7","com8","com9",
                "lpt1","lpt2","lpt3","lpt4","lpt5","lpt6","lpt7","lpt8","lpt9"];
            if reserved.contains(&name_str.as_str()) {
                // Use \\?\ extended path prefix to bypass reserved name check
                let parent = p.parent().unwrap_or(std::path::Path::new("."));
                let extended = format!("\\\\?\\{}\\{}", parent.display(), name.to_string_lossy());
                eprintln!("[PiGUI] Reserved device name detected, using extended path: {}", extended);
                extended
            } else {
                path.clone()
            }
        } else {
            path.clone()
        }
    };
    #[cfg(not(target_os = "windows"))]
    let fixed_path = path.clone();

    let target = std::path::Path::new(&fixed_path);
    eprintln!("[PiGUI] Target exists: {}", target.exists());
    eprintln!("[PiGUI] Target is_dir: {}", target.is_dir());
    eprintln!("[PiGUI] Target is_file: {}", target.is_file());

    if !target.exists() {
        // Fallback: try the original path without \\?\ prefix
        let orig_target = std::path::Path::new(&path);
        if orig_target.exists() {
            eprintln!("[PiGUI] Original path exists, using it instead");
            let result = delete_path(orig_target, &path);
            return result;
        }
        let err = format!("Path does not exist: {}", path);
        eprintln!("[PiGUI] {}", err);
        return Err(err);
    }

    delete_path(target, &path)
}

fn delete_path(target: &std::path::Path, display_path: &str) -> Result<(), String> {
    eprintln!("[PiGUI] Delete target: {:?}", target);
    eprintln!("[PiGUI] Target metadata: {:?}", target.metadata());

    let result = if target.is_dir() {
        std::fs::remove_dir_all(target).map_err(|e| format!("Failed to delete directory {}: {}", display_path, e))
    } else {
        // On Windows, try to remove read-only attribute first
        #[cfg(target_os = "windows")]
        {
            if let Ok(metadata) = std::fs::metadata(target) {
                let perms = metadata.permissions();
                if perms.readonly() {
                    let mut new_perms = perms.clone();
                    new_perms.set_readonly(false);
                    let _ = std::fs::set_permissions(target, new_perms);
                }
            }
        }
        std::fs::remove_file(target).map_err(|e| format!("Failed to delete file {}: {}", display_path, e))
    };
    if let Err(ref e) = result {
        eprintln!("[PiGUI] Delete failed: {}", e);
    } else {
        eprintln!("[PiGUI] Successfully deleted: {}", display_path);
    }
    result
}

/// Read directory contents as a tree structure
#[tauri::command]
fn pi_read_directory(path: String, max_depth: Option<u32>) -> Result<serde_json::Value, String> {
    let depth = max_depth.unwrap_or(3);
    read_dir_recursive(&path, depth, 0)
}

/// Read and parse a session JSONL file
#[tauri::command]
fn pi_read_session(path: String) -> Result<serde_json::Value, String> {
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
                            obj.insert("model".into(), serde_json::json!({
                                "provider": provider,
                                "modelId": model_id,
                            }));
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

// ── Session Driver Commands (placeholder implementations) ──

#[tauri::command]
fn pi_create_session(
    workspace: serde_json::Value,
    options: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let workspace_id = workspace["workspaceId"].as_str().unwrap_or("default");
    let session_id = uuid::Uuid::new_v4().to_string();
    
    let title = options.as_ref()
        .and_then(|o| o["title"].as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("Session {}", &session_id[..8]));
    
    let config = options.as_ref()
        .and_then(|o| o.get("initialModel").cloned());
    
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
fn pi_open_session(session_ref: serde_json::Value) -> Result<serde_json::Value, String> {
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
fn pi_archive_session(session_ref: serde_json::Value) -> Result<(), String> {
    // Placeholder: In real implementation, would mark session as archived
    println!("Archiving session: {:?}", session_ref);
    Ok(())
}

#[tauri::command]
fn pi_unarchive_session(session_ref: serde_json::Value) -> Result<(), String> {
    // Placeholder: In real implementation, would unmark session as archived
    println!("Unarchiving session: {:?}", session_ref);
    Ok(())
}

#[tauri::command]
fn pi_send_user_message(
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
fn pi_cancel_current_run(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Abort(AbortCommand::new("abort"));
    rpc.send_command(&cmd)
}

#[tauri::command]
fn pi_set_session_model(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
    selection: serde_json::Value,
) -> Result<(), String> {
    let provider = selection["provider"].as_str().unwrap_or("");
    let model_id = selection["modelId"].as_str().unwrap_or("");
    
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SetModel(SetModelCommand::new("set-model", provider.to_string(), model_id.to_string()));
    rpc.send_command(&cmd)
}

#[tauri::command]
fn pi_set_session_thinking_level(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
    thinking_level: String,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::SetThinkingLevel(SetThinkingLevelCommand::new("set-thinking", thinking_level));
    rpc.send_command(&cmd)
}

#[tauri::command]
fn pi_rename_session(session_ref: serde_json::Value, title: String) -> Result<(), String> {
    // Placeholder: In real implementation, would rename the session
    println!("Renaming session {:?} to: {}", session_ref, title);
    Ok(())
}

#[tauri::command]
fn pi_compact_session(
    state: State<'_, AppState>,
    session_ref: serde_json::Value,
    custom_instructions: Option<String>,
) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::Compact(CompactCommand::new("compact"));
    rpc.send_command(&cmd)
}

#[tauri::command]
fn pi_reload_session(session_ref: serde_json::Value) -> Result<(), String> {
    // Placeholder: In real implementation, would reload session from disk
    println!("Reloading session: {:?}", session_ref);
    Ok(())
}

#[tauri::command]
fn pi_get_session_tree(session_ref: serde_json::Value) -> Result<serde_json::Value, String> {
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
fn pi_navigate_session_tree(
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
fn pi_respond_to_host_ui_request(
    session_ref: serde_json::Value,
    response: serde_json::Value,
) -> Result<(), String> {
    // Placeholder: In real implementation, would send response back to pi
    println!("Responding to host UI request: {:?}", response);
    Ok(())
}

#[tauri::command]
fn pi_close_session(session_ref: serde_json::Value) -> Result<(), String> {
    // Placeholder: In real implementation, would close session
    println!("Closing session: {:?}", session_ref);
    Ok(())
}

fn read_dir_recursive(path: &str, max_depth: u32, current_depth: u32) -> Result<serde_json::Value, String> {
    let dir_path = std::path::Path::new(path);
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<serde_json::Value> = Vec::new();
    
    if let Ok(read_dir) = std::fs::read_dir(dir_path) {
        for entry in read_dir.flatten() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            // Skip hidden files and common non-project directories
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == ".git" {
                continue;
            }
            
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            
            let is_dir = metadata.is_dir();
            let entry_path_str = entry_path.to_string_lossy().to_string();
            
            // On Windows, use extended path for reserved device names
            #[cfg(target_os = "windows")]
            let display_path = {
                let name_lower = name.to_lowercase();
                let reserved = ["nul", "con", "aux", "prn",
                    "com1","com2","com3","com4","com5","com6","com7","com8","com9",
                    "lpt1","lpt2","lpt3","lpt4","lpt5","lpt6","lpt7","lpt8","lpt9"];
                if reserved.contains(&name_lower.as_str()) {
                    let parent = entry_path.parent().unwrap_or(std::path::Path::new("."));
                    format!("\\\\?\\{}\\{}", parent.display(), name)
                } else {
                    entry_path_str.clone()
                }
            };
            #[cfg(not(target_os = "windows"))]
            let display_path = entry_path_str.clone();
            
            let mut entry_obj = serde_json::json!({
                "name": name,
                "path": display_path,
                "type": if is_dir { "directory" } else { "file" },
            });
            
            // Add file extension
            if !is_dir {
                if let Some(ext) = entry_path.extension() {
                    entry_obj["extension"] = serde_json::json!(ext.to_string_lossy());
                }
                entry_obj["size"] = serde_json::json!(metadata.len());
            }
            
            // Recursively read subdirectories
            if is_dir && current_depth < max_depth {
                if let Ok(children) = read_dir_recursive(&display_path, max_depth, current_depth + 1) {
                    if let Some(arr) = children.as_array() {
                        entry_obj["children"] = serde_json::json!(arr);
                    }
                }
            }
            
            entries.push(entry_obj);
        }
    }
    
    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        let a_dir = a["type"].as_str() == Some("directory");
        let b_dir = b["type"].as_str() == Some("directory");
        if a_dir != b_dir {
            return b_dir.cmp(&a_dir);
        }
        let a_name = a["name"].as_str().unwrap_or("");
        let b_name = b["name"].as_str().unwrap_or("");
        a_name.to_lowercase().cmp(&b_name.to_lowercase())
    });
    
    Ok(serde_json::json!(entries))
}

// ── App Entry Point ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            rpc: Mutex::new(PiRpcClient::new()),
        })
        .invoke_handler(tauri::generate_handler![
            pi_start,
            pi_stop,
            pi_is_running,
            pi_prompt,
            pi_steer,
            pi_follow_up,
            pi_abort,
            pi_get_state,
            pi_get_messages,
            pi_set_model,
            pi_cycle_model,
            pi_get_available_models,
            pi_set_thinking_level,
            pi_new_session,
            pi_switch_session,
            pi_fork,
            pi_get_session_stats,
            pi_list_sessions,
            pi_extension_ui_response,
            pi_get_agent_settings,
            pi_set_agent_settings,
            pi_set_agent_auth,
    pi_get_agent_auth,
            pi_get_home_dir,
            pi_delete_file,
            pi_read_directory,
            pi_read_session,
            pi_create_session,
            pi_open_session,
            pi_archive_session,
            pi_unarchive_session,
            pi_send_user_message,
            pi_cancel_current_run,
            pi_set_session_model,
            pi_set_session_thinking_level,
            pi_rename_session,
            pi_compact_session,
            pi_reload_session,
            pi_get_session_tree,
            pi_navigate_session_tree,
            pi_respond_to_host_ui_request,
            pi_close_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
