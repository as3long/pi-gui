//! Async Tauri command handlers
//!
//! All commands are async and use tokio::sync::Mutex to ensure
//! the Tauri runtime thread is never blocked. This eliminates
//! UI jank and ensures smooth user experience.

use crate::state::AppState;
use std::time::Duration;
use tokio::sync::MutexGuard;

const LOCK_TIMEOUT_MS: u64 = 200;

/// Acquire the RPC mutex lock with a timeout.
pub async fn lock_rpc<'a>(
    state: &'a tauri::State<'_, AppState>,
) -> Result<MutexGuard<'a, crate::rpc::client::PiRpcClient>, String> {
    tokio::time::timeout(Duration::from_millis(LOCK_TIMEOUT_MS), state.rpc.lock())
        .await
        .map_err(|_| "Lock timeout: RPC client is busy".to_string())
}

pub mod config;
pub mod fs;
pub mod messages;
pub mod model;
pub mod packages;
pub mod process;
pub mod session;
pub mod session_driver;
pub mod state;

pub use config::*;
pub use fs::*;
pub use messages::*;
pub use model::*;
pub use packages::*;
pub use process::*;
pub use session::*;
pub use session_driver::*;
pub use state::*;
