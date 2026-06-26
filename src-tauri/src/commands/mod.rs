//! Async Tauri command handlers
//!
//! All commands are async and use tokio::sync::Mutex to ensure
//! the Tauri runtime thread is never blocked. This eliminates
//! UI jank and ensures smooth user experience.

pub mod config;
pub mod fs;
pub mod messages;
pub mod model;
pub mod packages;
pub mod process;
pub mod session;
pub mod session_driver;
pub mod state;

// Re-export all commands for easy inclusion in lib.rs
pub use config::*;
pub use fs::*;
pub use messages::*;
pub use model::*;
pub use packages::*;
pub use process::*;
pub use session::*;
pub use session_driver::*;
pub use state::*;
