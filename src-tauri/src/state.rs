use crate::rpc::client::PiRpcClient;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;

/// Thread-safe application state using async Mutex
/// 
/// Uses tokio::sync::Mutex instead of std::sync::Mutex to prevent
/// blocking the Tauri async runtime, which eliminates UI jank.
#[derive(Default)]
pub struct AppState {
    /// Async mutex-protected RPC client
    pub rpc: Mutex<PiRpcClient>,
    
    /// Atomic flag for quick running status checks (no lock needed)
    is_running: AtomicBool,
}

impl AppState {
    /// Create a new application state
    pub fn new() -> Self {
        Self {
            rpc: Mutex::new(PiRpcClient::new()),
            is_running: AtomicBool::new(false),
        }
    }
    
    /// Quick check if pi is running (atomic, no lock required)
    pub fn is_pi_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }
    
    /// Update the running status flag
    pub fn set_pi_running(&self, running: bool) {
        self.is_running.store(running, Ordering::SeqCst);
    }
}
