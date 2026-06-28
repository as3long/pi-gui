use crate::state::AppState;
use tauri::AppHandle;

/// Start the pi subprocess (async).
#[tauri::command]
pub async fn pi_start(
    state: tauri::State<'_, AppState>,
    app: AppHandle,
    cwd: String,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let result = rpc.spawn(&cwd, app);
    if result.is_ok() {
        state.set_pi_running(true);
    }
    result
}

/// Stop the pi subprocess (async).
#[tauri::command]
pub async fn pi_stop(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let result = rpc.kill();
    if result.is_ok() {
        state.set_pi_running(false);
    }
    result
}

/// Check if pi is running (lock-free atomic operation).
#[tauri::command]
pub fn pi_is_running(
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    Ok(state.is_pi_running())
}
