use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

use super::protocol::*;

/// Find node.exe in common locations
fn find_node_exe() -> Option<String> {
    // 1. Check PATH first (most reliable)
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let node_exe = dir.join("node.exe");
            if node_exe.exists() {
                return Some(node_exe.to_string_lossy().to_string());
            }
        }
    }

    // 2. Check fnm multishells directory
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let fnm_multishells = PathBuf::from(local_app_data).join("fnm_multishells");
        if fnm_multishells.exists() {
            if let Ok(entries) = std::fs::read_dir(&fnm_multishells) {
                for entry in entries.flatten() {
                    let node_exe = entry.path().join("node.exe");
                    if node_exe.exists() {
                        return Some(node_exe.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    None
}

/// Find pi's cli.js script by looking in node_modules directories
fn find_pi_cli_js(node_exe_path: &str) -> Option<String> {
    let node_path = PathBuf::from(node_exe_path);
    let node_dir = node_path.parent()?;

    // 1. Check sibling node_modules (fnm multishell, npm global)
    let cli_js = node_dir
        .join("node_modules")
        .join("@earendil-works")
        .join("pi-coding-agent")
        .join("dist")
        .join("cli.js");
    
    if cli_js.exists() {
        return Some(cli_js.to_string_lossy().to_string());
    }

    // 2. Check ../node_modules (relative)
    if let Some(parent) = node_dir.parent() {
        let cli_js = parent
            .join("node_modules")
            .join("@earendil-works")
            .join("pi-coding-agent")
            .join("dist")
            .join("cli.js");
        if cli_js.exists() {
            return Some(cli_js.to_string_lossy().to_string());
        }
    }

    // 3. Common npm global location
    if let Ok(home) = std::env::var("USERPROFILE") {
        let cli_js = PathBuf::from(&home)
            .join("AppData")
            .join("Roaming")
            .join("npm")
            .join("node_modules")
            .join("@earendil-works")
            .join("pi-coding-agent")
            .join("dist")
            .join("cli.js");
        if cli_js.exists() {
            return Some(cli_js.to_string_lossy().to_string());
        }
    }

    None
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

    pub fn spawn(
        &mut self,
        cwd: &str,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        self.spawn_with_model(cwd, app_handle, None)
    }

    pub fn spawn_with_model(
        &mut self,
        cwd: &str,
        app_handle: AppHandle,
        model: Option<&str>,
    ) -> Result<(), String> {
        if self.is_running() {
            return Err("pi is already running".into());
        }

        // 🎯 ZERO WINDOW SOLUTION: Direct node.exe execution
        // This completely bypasses cmd.exe - no window at all!
        let node_exe = find_node_exe().ok_or_else(|| {
            eprintln!("[PiGUI] node.exe not found in PATH");
            "node.exe not found. Please ensure Node.js is installed and in PATH.".to_string()
        })?;

        let cli_js = find_pi_cli_js(&node_exe).ok_or_else(|| {
            eprintln!("[PiGUI] pi cli.js not found near node.exe: {}", node_exe);
            "pi cli.js not found. Please install pi-coding-agent: npm i -g pi-coding-agent".to_string()
        })?;

        eprintln!("[PiGUI] Using node.exe: {}", node_exe);
        eprintln!("[PiGUI] Using cli.js: {}", cli_js);

        // ✅ DIRECT EXECUTION - NO SHELL, NO WINDOW
        // node.exe is a real executable, CREATE_NO_WINDOW works perfectly
        let mut cmd = Command::new(&node_exe);
        cmd.arg(&cli_js);
        cmd.args(["--mode", "rpc", "--no-session"]);

        if let Some(m) = model {
            eprintln!("[PiGUI] Setting model: {}", m);
            cmd.arg("--model").arg(m);
        }

        cmd.current_dir(cwd);

        // 🔐 CREATE_NO_WINDOW works 100% for real executables!
        // The window flash was only from cmd.exe, which we are now bypassing
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        eprintln!("[PiGUI] Spawning pi directly via node.exe...");

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

        let pid = child.id();
        eprintln!("[PiGUI] Pi process started with PID: {}", pid);

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

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn kill(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        self.stdin = None;
        if let Some(mut process) = self.process.take() {
            #[cfg(target_os = "windows")]
            {
                use std::process::Stdio;
                let pid = process.id();
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .and_then(|mut c| c.wait());
            }
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

        let _ = app_handle.emit("pi:raw", &line);

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

/// Find the pi binary in PATH or common locations (fallback)
pub fn find_pi() -> Option<String> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate_cmd = dir.join("pi.cmd");
            if candidate_cmd.exists() {
                return Some(candidate_cmd.to_string_lossy().to_string());
            }
            let candidate_exe = dir.join("pi.exe");
            if candidate_exe.exists() {
                return Some(candidate_exe.to_string_lossy().to_string());
            }
        }
    }
    None
}
