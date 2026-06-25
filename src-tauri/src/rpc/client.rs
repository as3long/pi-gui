use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

use super::protocol::*;

/// Manages the pi --mode rpc subprocess lifecycle and JSONL communication.
pub struct PiRpcClient {
    process: Option<Child>,
    stdin: Option<std::process::ChildStdin>,
    running: Arc<AtomicBool>,
}

impl PiRpcClient {
    pub fn new() -> Self {
        Self {
            process: None,
            stdin: None,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Spawn the `pi --mode rpc` subprocess and start the event reader thread.
    /// `cwd` is the working directory for pi.
    pub fn spawn(
        &mut self,
        cwd: &str,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        if self.is_running() {
            return Err("pi is already running".into());
        }

        let pi_path = find_pi().ok_or_else(|| {
            let error_msg = "pi not found. Please ensure pi-coding-agent is installed and available in PATH.";
            eprintln!("[PiGUI] {}", error_msg);
            error_msg.to_string()
        })?;

        eprintln!("[PiGUI] Found pi at: {}", pi_path);

        // Handle PowerShell scripts on Windows
        let mut cmd = Command::new(&pi_path);
        let mut args = vec!["--mode", "rpc", "--no-session"];

        // If pi is a .ps1 file, use powershell.exe to run it
        if pi_path.ends_with(".ps1") {
            eprintln!("[PiGUI] Using PowerShell to run .ps1 script");
            cmd = Command::new("powershell.exe");
            args = vec!["-ExecutionPolicy", "Bypass", "-File", &pi_path, "--mode", "rpc", "--no-session"];
        }

        eprintln!("[PiGUI] Spawning pi with args: {:?}", args);

        let mut child = cmd
            .args(&args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                let error_msg = format!("Failed to spawn pi: {}", e);
                eprintln!("[PiGUI] {}", error_msg);
                error_msg
            })?;

        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

        self.process = Some(child);
        self.stdin = Some(stdin);
        self.running.store(true, Ordering::SeqCst);

        // Start event reader thread
        let running = self.running.clone();
        thread::spawn(move || {
            read_events(stdout, app_handle, running);
        });

        Ok(())
    }

    /// Send a JSONL command to the pi subprocess stdin.
    pub fn send_command(&mut self, command: &RpcCommand) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("pi stdin not available")?;

        let json = serde_json::to_string(command)
            .map_err(|e| format!("Failed to serialize command: {}", e))?;

        writeln!(stdin, "{}", json)
            .map_err(|e| format!("Failed to write to pi stdin: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush pi stdin: {}", e))?;

        Ok(())
    }

    /// Send an Extension UI response back to pi.
    pub fn send_extension_ui_response(&mut self, response: &ExtensionUiResponse) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("pi stdin not available")?;

        let json = serde_json::to_string(response)
            .map_err(|e| format!("Failed to serialize extension UI response: {}", e))?;

        writeln!(stdin, "{}", json)
            .map_err(|e| format!("Failed to write extension UI response: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush pi stdin: {}", e))?;

        Ok(())
    }

    /// Check if the pi subprocess is still running.
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Kill the pi subprocess.
    pub fn kill(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        // Drop stdin first to signal EOF to the process
        self.stdin = None;
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
        Ok(())
    }
}

impl Drop for PiRpcClient {
    fn drop(&mut self) {
        let _ = self.kill();
    }
}

/// Read JSONL lines from pi's stdout and emit them as Tauri events.
fn read_events(reader: impl Read + Send + 'static, app_handle: AppHandle, running: Arc<AtomicBool>) {
    let buf_reader = BufReader::new(reader);

    for line in buf_reader.lines() {
        if !running.load(Ordering::SeqCst) {
            break;
        }

        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        // Forward raw JSON line to frontend as a Tauri event
        let _ = app_handle.emit("pi:raw", &line);

        // Also try to parse and emit typed events
        if let Ok(event) = serde_json::from_str::<RpcEvent>(&line) {
            let event_name = match &event {
                RpcEvent::AgentStart => "pi:agent_start",
                RpcEvent::AgentEnd { .. } => "pi:agent_end",
                RpcEvent::TurnStart => "pi:turn_start",
                RpcEvent::TurnEnd { .. } => "pi:turn_end",
                RpcEvent::MessageStart { .. } => "pi:message_start",
                RpcEvent::MessageUpdate { .. } => "pi:message_update",
                RpcEvent::MessageEnd { .. } => "pi:message_end",
                RpcEvent::ToolExecutionStart { .. } => "pi:tool_execution_start",
                RpcEvent::ToolExecutionUpdate { .. } => "pi:tool_execution_update",
                RpcEvent::ToolExecutionEnd { .. } => "pi:tool_execution_end",
                RpcEvent::QueueUpdate { .. } => "pi:queue_update",
                RpcEvent::CompactionStart { .. } => "pi:compaction_start",
                RpcEvent::CompactionEnd { .. } => "pi:compaction_end",
                RpcEvent::AutoRetryStart { .. } => "pi:auto_retry_start",
                RpcEvent::AutoRetryEnd { .. } => "pi:auto_retry_end",
                RpcEvent::ExtensionUiRequest { .. } => "pi:extension_ui_request",
                RpcEvent::Response { .. } => "pi:response",
                RpcEvent::ExtensionError { .. } => "pi:extension_error",
            };
            let _ = app_handle.emit(event_name, &line);
        }
    }

    running.store(false, Ordering::SeqCst);
    let _ = app_handle.emit("pi:process_exit", "");
}

/// Find the pi binary in PATH or common locations.
fn find_pi() -> Option<String> {
    // Check PATH first - look for actual executables
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            // Check for pi.exe on Windows (highest priority)
            let candidate_exe = dir.join("pi.exe");
            if candidate_exe.exists() {
                return Some(candidate_exe.to_string_lossy().to_string());
            }
            // Check for pi.cmd on Windows
            let candidate_cmd = dir.join("pi.cmd");
            if candidate_cmd.exists() {
                return Some(candidate_cmd.to_string_lossy().to_string());
            }
        }
    }

    // Check fnm multishells directory (dynamic names)
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let fnm_multishells = std::path::PathBuf::from(&local_app_data).join("fnm_multishells");
    if fnm_multishells.exists() {
        if let Ok(entries) = std::fs::read_dir(&fnm_multishells) {
            for entry in entries.flatten() {
                let dir = entry.path();
                if dir.is_dir() {
                    // Check for pi files in each subdirectory
                    for name in &["pi.exe", "pi.cmd", "pi.ps1"] {
                        let candidate = dir.join(name);
                        if candidate.exists() {
                            return Some(candidate.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    // Check common locations
    let common_locations = [
        // npm global on Unix
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        // fnm/node locations
        &format!(
            r"{}\AppData\Roaming\fnm\node-versions\v26.2.0\installation\pi",
            std::env::var("USERPROFILE").unwrap_or_default()
        ),
    ];

    for loc in &common_locations {
        let path = std::path::Path::new(loc);
        if path.exists() {
            return Some(loc.to_string());
        }
    }

    None
}


