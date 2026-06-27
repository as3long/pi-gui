use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender, Receiver};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use super::protocol::*;

/// Message to send to stdin writer thread
enum StdinMessage {
    Command(String),
    Quit,
}

/// Find pi executable in PATH
fn find_pi() -> Option<String> {
    let pi_names = if cfg!(windows) {
        vec!["pi.cmd", "pi.exe", "pi.bat"]
    } else {
        vec!["pi"]
    };

    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in &pi_names {
                let pi_path = dir.join(name);
                if pi_path.exists() {
                    return Some(pi_path.to_string_lossy().to_string());
                }
            }
        }
    }

    None
}

/// Manages the pi --mode rpc subprocess lifecycle and JSONL communication.
#[derive(Default)]
pub struct PiRpcClient {
    process: Option<Child>,
    #[allow(dead_code)]
    stdin: Option<std::process::ChildStdin>,
    running: Arc<AtomicBool>,
    stdin_sender: Option<Sender<StdinMessage>>,
}

impl PiRpcClient {
    pub fn new() -> Self {
        Self {
            process: None,
            stdin: None,
            running: Arc::new(AtomicBool::new(false)),
            stdin_sender: None,
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

        // ✅ KEEP IT SIMPLE: Just find and execute pi directly
        let pi_path = find_pi().ok_or_else(|| {
            let error_msg = "pi not found. Please run: npm i -g pi-coding-agent";
            eprintln!("[PiGUI] {}", error_msg);
            error_msg.to_string()
        })?;

        eprintln!("[PiGUI] Found pi at: {}", pi_path);

        let mut cmd = Command::new(&pi_path);
        cmd.args(["--mode", "rpc", "--no-session"]);

        if let Some(m) = model {
            eprintln!("[PiGUI] Setting model: {}", m);
            cmd.arg("--model").arg(m);
        }

        cmd.current_dir(cwd);

        // Windows: hide console window
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
        self.running.store(true, Ordering::SeqCst);

        // Create channel for async stdin writes
        let (stdin_tx, stdin_rx): (Sender<StdinMessage>, Receiver<StdinMessage>) = mpsc::channel();
        self.stdin_sender = Some(stdin_tx);

        // Spawn background thread for stdin writes (non-blocking)
        let running_for_stdin = self.running.clone();
        thread::spawn(move || {
            let mut stdin = stdin;
            while running_for_stdin.load(Ordering::SeqCst) {
                match stdin_rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(StdinMessage::Command(json)) => {
                        eprintln!("[PiGUI] Writing to stdin: {}", &json[..json.len().min(100)]);
                        if let Err(e) = writeln!(stdin, "{}", json) {
                            eprintln!("[PiGUI] Failed to write to stdin: {}", e);
                            break;
                        }
                        if let Err(e) = stdin.flush() {
                            eprintln!("[PiGUI] Failed to flush stdin: {}", e);
                            break;
                        }
                    }
                    Ok(StdinMessage::Quit) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        continue;
                    }
                }
            }
            eprintln!("[PiGUI] Stdin writer thread exiting");
        });

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
        let sender = self.stdin_sender.as_ref().ok_or("stdin channel not available")?;

        let json = serde_json::to_string(command)
            .map_err(|e| format!("Failed to serialize command: {}", e))?;

        // Non-blocking send to background thread
        sender.send(StdinMessage::Command(json))
            .map_err(|e| format!("Failed to send to stdin writer: {}", e))?;
        
        Ok(())
    }

    pub fn send_extension_ui_response(&mut self, response: &ExtensionUiResponse) -> Result<(), String> {
        let sender = self.stdin_sender.as_ref().ok_or("stdin channel not available")?;

        let json = serde_json::to_string(response)
            .map_err(|e| format!("Failed to serialize extension UI response: {}", e))?;

        // Non-blocking send to background thread
        sender.send(StdinMessage::Command(json))
            .map_err(|e| format!("Failed to send to stdin writer: {}", e))?;
        
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn kill(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        // Send quit signal to stdin writer thread
        if let Some(sender) = self.stdin_sender.take() {
            let _ = sender.send(StdinMessage::Quit);
        }
        self.stdin = None;
        if let Some(mut process) = self.process.take() {
            // Windows: Use taskkill to kill entire process tree
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                use std::process::Stdio;
                let pid = process.id();
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .and_then(|mut c| c.wait());
            }

            // Unix: Use kill to kill process group
            #[cfg(unix)]
            {
                use std::process::Stdio;
                let pid = process.id();
                let _ = Command::new("kill")
                    .args(["-TERM", &format!("-{}", pid)])
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

        // Fast path for frequent events
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

        // Less frequent events - do full JSON parsing
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
