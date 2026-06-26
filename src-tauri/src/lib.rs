mod rpc;
mod state;
mod commands;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tokio runtime for async operations
    // Tauri already provides a tokio runtime, but we ensure it's properly configured
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Use async Mutex for non-blocking state management
        .manage(AppState::new())
        // Async command handlers - all commands are async to prevent UI blocking
        .invoke_handler(tauri::generate_handler![
            commands::pi_start,
            commands::pi_stop,
            commands::pi_is_running,
            commands::pi_prompt,
            commands::pi_steer,
            commands::pi_follow_up,
            commands::pi_abort,
            commands::pi_get_state,
            commands::pi_get_messages,
            commands::pi_set_model,
            commands::pi_cycle_model,
            commands::pi_get_available_models,
            commands::pi_set_thinking_level,
            commands::pi_new_session,
            commands::pi_switch_session,
            commands::pi_fork,
            commands::pi_get_session_stats,
            commands::pi_list_sessions,
            commands::pi_extension_ui_response,
            commands::pi_get_agent_settings,
            commands::pi_set_agent_settings,
            commands::pi_set_agent_auth,
            commands::pi_get_agent_auth,
            commands::pi_get_home_dir,
            commands::pi_delete_file,
            commands::pi_read_directory,
            commands::pi_read_session,
            commands::pi_install_package,
            commands::pi_list_packages,
            commands::pi_create_session,
            commands::pi_open_session,
            commands::pi_archive_session,
            commands::pi_unarchive_session,
            commands::pi_send_user_message,
            commands::pi_cancel_current_run,
            commands::pi_set_session_model,
            commands::pi_set_session_thinking_level,
            commands::pi_rename_session,
            commands::pi_compact_session,
            commands::pi_reload_session,
            commands::pi_get_session_tree,
            commands::pi_navigate_session_tree,
            commands::pi_respond_to_host_ui_request,
            commands::pi_close_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
