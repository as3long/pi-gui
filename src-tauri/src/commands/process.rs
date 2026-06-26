use crate::state::AppState;
use tauri::{AppHandle, State};

/// Start the pi subprocess.
#[tauri::command]
pub fn pi_start(state: State<'_, AppState>, app: AppHandle, cwd: String) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    rpc.spawn(&cwd, app)
}

/// Stop the pi subprocess.
#[tauri::command]
pub fn pi_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    rpc.kill()
}

/// Check if pi is running.
#[tauri::command]
pub fn pi_is_running(state: State<'_, AppState>) -> Result<bool, String> {
    let rpc = state.rpc.lock().map_err(|e| e.to_string())?;
    Ok(rpc.is_running())
}
