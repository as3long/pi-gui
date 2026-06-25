mod rpc;

use rpc::client::PiRpcClient;
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
fn pi_set_model(state: State<'_, AppState>, provider: String, model_id: String) -> Result<(), String> {
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

/// List all configured models.
#[tauri::command]
fn pi_get_available_models(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    let cmd = RpcCommand::GetAvailableModels(GetAvailableModelsCommand::new("get-models"));
    rpc.send_command(&cmd)
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

// ── App Entry Point ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
