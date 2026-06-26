use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

use super::protocol::*;

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

        let pi_path = find_pi().ok_or_else(|| {
            let error_msg = "pi not found. Please ensure pi-coding-agent is installed and available in PATH.";
            eprintln!("[PiGUI] {}", error_msg);
            error_msg.to_string()
        })?;

        eprintln!("[PiGUI] Found pi at: {}", pi_path);

        // ✅ KEEP IT SIMPLE: Direct execution + single flag
        // No wrappers, no cmd.exe /c, just execute pi.cmd directly
        // Windows knows how to execute .cmd files
        let mut cmd = Command::new(&pi_path);
        
        cmd.args(["--mode", "rpc", "--no-session"]);

        if let Some(m) = model {
            eprintln!("[PiGUI] Setting model: {}", m);
            cmd.arg("--model").arg(m);
        }

        cmd.current_dir(cwd);

        // 🔐 ONLY ONE FLAG - KEEP IT SIMPLE
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
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

    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let fnm_multishells = std::path::PathBuf::from(&local_app_data).join("fnm_multishells");
    if fnm_multishells.exists() {
        if let Ok(entries) = std::fs::read_dir(&fnm_multishells) {
            for entry in entries.flatten() {
                let dir = entry.path();
                if dir.is_dir() {
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
        }
    }

    None
}
