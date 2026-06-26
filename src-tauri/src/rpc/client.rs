use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

use super::protocol::*;

/// Type of pi executable found
enum PiExecutable {
    /// Direct executable (pi.exe or pi)
    Exe(String),
    /// Node.js script (parsed from pi.cmd)
    NodeScript { node_path: String, script_path: String },
}

/// Manages the pi --mode rpc subprocess lifecycle and JSONL communication.
#[derive(Default)]
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
        self.spawn_with_model(cwd, app_handle, None)
    }

    /// Spawn pi with an optional --model flag.
    pub fn spawn_with_model(
        &mut self,
        cwd: &str,
        app_handle: AppHandle,
        model: Option<&str>,
    ) -> Result<(), String> {
        if self.is_running() {
            return Err("pi is already running".into());
        }

        let pi_executable = find_pi_executable().ok_or_else(|| {
            let error_msg = "pi not found. Please ensure pi-coding-agent is installed and available in PATH.";
            eprintln!("[PiGUI] {}", error_msg);
            error_msg.to_string()
        })?;

        eprintln!("[PiGUI] Found pi executable: {:?}", match &pi_executable {
            PiExecutable::Exe(p) => format!("exe: {}", p),
            PiExecutable::NodeScript { node_path, script_path } => format!("node: {} script: {}", node_path, script_path),
        });

        // Build command based on executable type
        let mut cmd: Command;
        match &pi_executable {
            PiExecutable::Exe(path) => {
                cmd = Command::new(path);
            }
            PiExecutable::NodeScript { node_path, script_path } => {
                cmd = Command::new(node_path);
                cmd.arg(script_path);
            }
        }

        // Common arguments
        cmd.args(["--mode", "rpc", "--no-session"]);

        // Add --model flag if specified
        if let Some(m) = model {
            eprintln!("[PiGUI] Setting model: {}", m);
            cmd.arg("--model").arg(m);
        }

        cmd.current_dir(cwd);

        // Windows-specific: hide console window using multiple flags
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW: don't create a console for this process
            // CREATE_NEW_PROCESS_GROUP: create a new process group
            // DETACHED_PROCESS: detach from console completely
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
            const DETACHED_PROCESS: u32 = 0x00000008;
            let flags = CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS;
            cmd.creation_flags(flags);
        }

        eprintln!("[PiGUI] Spawning pi process...");

        let mut child = cmd
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
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        self.process = Some(child);
        self.stdin = Some(stdin);
        self.running.store(true, Ordering::SeqCst);

        // Start event reader thread
        let running = self.running.clone();
        thread::spawn(move || {
            read_events(stdout, app_handle.clone(), running.clone());
        });

        // Start stderr reader thread for debugging
        thread::spawn(move || {
            let buf_reader = BufReader::new(stderr);
            for line in buf_reader.lines() {
                if let Ok(line) = line {
                    if !line.trim().is_empty() {
                        eprintln!("[Pi stderr] {}", line);
                    }
                }
            }
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

        // Quick pattern match on type field to avoid full JSON parsing for high-frequency events
        if line.contains(r#""type":"message_update""#) {
            let _ = app_handle.emit("pi:message_update", &line);
            continue;
        }
        if line.contains(r#""type":"message_delta""#) {
            let _ = app_handle.emit("pi:message_delta", &line);
            continue;
        }
        if line.contains(r#""type":"tool_execution_update""#) {
            let _ = app_handle.emit("pi:tool_execution_update", &line);
            continue;
        }

        // For less frequent events, do full JSON parsing
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

/// Find the pi executable in PATH or common locations.
/// Returns a PiExecutable enum indicating how to run pi.
fn find_pi_executable() -> Option<PiExecutable> {
    // Check PATH first
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            // Check for pi.exe on Windows (highest priority)
            let candidate_exe = dir.join("pi.exe");
            if candidate_exe.exists() {
                return Some(PiExecutable::Exe(candidate_exe.to_string_lossy().to_string()));
            }
            // Check for pi.cmd on Windows - parse it to find node script
            let candidate_cmd = dir.join("pi.cmd");
            if candidate_cmd.exists() {
                if let Some(script) = parse_cmd_to_find_node_script(&candidate_cmd) {
                    return Some(script);
                }
                // Fallback to running .cmd directly if parsing fails
                return Some(PiExecutable::Exe(candidate_cmd.to_string_lossy().to_string()));
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
                    // Check for pi.exe first
                    let candidate_exe = dir.join("pi.exe");
                    if candidate_exe.exists() {
                        return Some(PiExecutable::Exe(candidate_exe.to_string_lossy().to_string()));
                    }
                    // Check for pi.cmd and parse it
                    let candidate_cmd = dir.join("pi.cmd");
                    if candidate_cmd.exists() {
                        if let Some(script) = parse_cmd_to_find_node_script(&candidate_cmd) {
                            return Some(script);
                        }
                        return Some(PiExecutable::Exe(candidate_cmd.to_string_lossy().to_string()));
                    }
                }
            }
        }
    }

    // Check common locations
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let common_locations = [
        // npm global on Unix
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        // fnm/node locations on Windows
        &format!(r"{}\AppData\Roaming\fnm\node-versions\v26.2.0\installation\pi.cmd", home),
    ];

    for loc in &common_locations {
        let path = std::path::Path::new(loc);
        if path.exists() {
            if loc.ends_with(".cmd") {
                if let Some(script) = parse_cmd_to_find_node_script(path) {
                    return Some(script);
                }
            }
            return Some(PiExecutable::Exe(loc.to_string()));
        }
    }

    None
}

/// Parse a .cmd file to find the node.js script path.
/// Returns a NodeScript enum variant if successful.
fn parse_cmd_to_find_node_script(cmd_path: &std::path::Path) -> Option<PiExecutable> {
    // Read the cmd file
    let content = match std::fs::read_to_string(cmd_path) {
        Ok(c) => c,
        Err(_) => return None,
    };

    // Look for node.exe in the same directory first
    let parent_dir = cmd_path.parent()?;

    // Check if node.exe exists in the same directory
    let node_path = parent_dir.join("node.exe");
    if !node_path.exists() {
        // If not, try to find node.exe in PATH
        if let Ok(path) = std::env::var("PATH") {
            for dir in std::env::split_paths(&path) {
                let candidate = dir.join("node.exe");
                if candidate.exists() {
                    return find_cli_js(&content, candidate.to_string_lossy().to_string());
                }
            }
        }
        return None;
    }

    find_cli_js(&content, node_path.to_string_lossy().to_string())
}

/// Find the CLI .js path in the cmd file content (without regex)
fn find_cli_js(content: &str, node_path: String) -> Option<PiExecutable> {
    // Look for "node_modules" and "cli.js" in the same line
    for line in content.lines() {
        if line.contains("node_modules") && line.contains("cli.js") {
            // Extract the path between node_modules and cli.js (inclusive)
            if let Some(start) = line.find("node_modules") {
                if let Some(end) = line.find("cli.js") {
                    let script_rel = &line[start..end + 6]; // +6 for "cli.js"
                    
                    // Clean up quotes and spaces
                    let script_rel = script_rel.trim_matches('"').trim_matches('\'').trim();
                    
                    // Try to find the script relative to node.exe location
                    let node_path_buf = std::path::Path::new(&node_path);
                    let script_path = node_path_buf.parent()?.join(script_rel);
                    if script_path.exists() {
                        return Some(PiExecutable::NodeScript {
                            node_path: node_path.clone(),
                            script_path: script_path.to_string_lossy().to_string(),
                        });
                    }

                    // Try relative to node_modules sibling
                    if let Some(parent) = node_path_buf.parent() {
                        let script_path = parent.join(script_rel);
                        if script_path.exists() {
                            return Some(PiExecutable::NodeScript {
                                node_path,
                                script_path: script_path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    None
}
