use crate::rpc::protocol::StreamEvent;
use crate::state::AppState;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::AppHandle;

/// Start the pi subprocess (async).
/// Uses legacy event emission (backward compatible).
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

/// Start the pi subprocess with streaming via Tauri Channel API.
/// This is the preferred method for efficient streaming.
///
/// The command stays alive while pi runs, keeping the channel open.
/// When pi exits, the command completes and the channel closes.
#[tauri::command]
pub async fn pi_start_streaming(
    state: tauri::State<'_, AppState>,
    app: AppHandle,
    cwd: String,
    channel: Channel<StreamEvent>,
) -> Result<(), String> {
    // Start pi process with the channel
    {
        let mut rpc = super::lock_rpc(&state).await?;
        let result = rpc.spawn_with_channel(&cwd, app, channel);
        if result.is_ok() {
            state.set_pi_running(true);
        } else {
            return result;
        }
    }

    // Keep the command alive while pi runs.
    // This keeps the channel open for streaming.
    // When pi exits, this loop ends and the command completes.
    loop {
        tokio::time::sleep(Duration::from_millis(200)).await;
        if !state.is_pi_running() {
            break;
        }
    }

    Ok(())
}

/// Stop the pi subprocess (async).
#[tauri::command]
pub async fn pi_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut rpc = super::lock_rpc(&state).await?;
    let result = rpc.kill();
    if result.is_ok() {
        state.set_pi_running(false);
    }
    result
}

/// Check if pi is running (lock-free atomic operation).
#[tauri::command]
pub fn pi_is_running(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(state.is_pi_running())
}
