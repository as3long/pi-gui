use crate::state::AppState;
use tauri::{AppHandle, State};

/// Start the pi subprocess (async).
/// 
/// Uses async Mutex ensures the Tauri runtime thread is never blocked.
/// The lock is held only for the duration of the spawn operation.
#[tauri::command]
pub async fn pi_start(
    state: State<'_, AppState>,
    app: AppHandle,
    cwd: String,
) -> Result<(), String> {
    // Acquire async mutex lock - this will yield to runtime instead of blocking
    let mut rpc = state.rpc.lock().await;
    
    let result = rpc.spawn(&cwd, app);
    
    if result.is_ok() {
        state.set_pi_running(true);
    }
    
    result
}

/// Stop the pi subprocess (async).
#[tauri::command]
pub async fn pi_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut rpc = state.rpc.lock().await;
    let result = rpc.kill();
    
    if result.is_ok() {
        state.set_pi_running(false);
    }
    
    result
}

/// Check if pi is running (lock-free atomic operation).
/// 
/// This is optimized path uses an AtomicBool for O(1) lock-free checks,
/// which is ideal for frequent UI status updates.
#[tauri::command]
pub fn pi_is_running(state: State<'_, AppState>) -> Result<bool, String> {
    // Fast path: atomic load without any locking
    Ok(state.is_pi_running())
}
