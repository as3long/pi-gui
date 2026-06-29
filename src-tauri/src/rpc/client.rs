use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender, Receiver};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri::ipc::Channel;

use super::protocol::*;

/// Message to send to stdin writer thread
enum StdinMessage {
    Command(String),
    Quit,
}

/// Find pi executable in PATH
fn find_pi() -> Option<String> {
    crate::commands::find_pi_binary().ok()
}

/// Manages the pi --mode rpc subprocess lifecycle and JSONL communication.
#[derive(Default)]
pub struct PiRpcClient {
    process: Option<Child>,

    running: Arc<AtomicBool>,
    stdin_sender: Option<Sender<StdinMessage>>,
}

impl PiRpcClient {
    pub fn new() -> Self {
        Self {
            process: None,
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

    /// Spawn pi process with a Channel for streaming events.
    /// This is the preferred method for Tauri Channel API integration.
    pub fn spawn_with_channel(
        &mut self,
        cwd: &str,
        app_handle: AppHandle,
        channel: Channel<StreamEvent>,
    ) -> Result<(), String> {
        self.spawn_with_model_and_channel(cwd, app_handle, None, Some(channel))
    }

    pub fn spawn_with_model(
        &mut self,
        cwd: &str,
        app_handle: AppHandle,
        model: Option<&str>,
    ) -> Result<(), String> {
        self.spawn_with_model_and_channel(cwd, app_handle, model, None)
    }

    fn spawn_with_model_and_channel(
        &mut self,
        cwd: &str,
        app_handle: AppHandle,
        model: Option<&str>,
        channel: Option<Channel<StreamEvent>>,
    ) -> Result<(), String> {
        if self.is_running() {
            return Err("pi is already running".into());
        }

        // ✅ KEEP IT SIMPLE: Just find and execute pi directly
        let pi_path = find_pi().ok_or_else(|| {
            let error_msg = "pi not found. Please run: npm i -g pi-coding-agent";
            tracing::error!("{}", error_msg);
            error_msg.to_string()
        })?;

        tracing::info!("Found pi at: {}", pi_path);

        let mut cmd = Command::new(&pi_path);
        cmd.args(["--mode", "rpc", "--no-session"]);

        if let Some(m) = model {
            tracing::debug!("Setting model: {}", m);
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

        tracing::info!("Spawning pi process...");

        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                let error_msg = format!("Failed to spawn pi: {}", e);
                tracing::error!("{}", error_msg);
                error_msg
            })?;

        let pid = child.id();
        tracing::info!("Pi process started with PID: {}", pid);

        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        self.process = Some(child);
        self.running.store(true, Ordering::Release);

        // Create channel for async stdin writes
        let (stdin_tx, stdin_rx): (Sender<StdinMessage>, Receiver<StdinMessage>) = mpsc::channel();
        self.stdin_sender = Some(stdin_tx);

        // Spawn background thread for stdin writes (non-blocking)
        let running_for_stdin = self.running.clone();
        thread::spawn(move || {
            let mut stdin = stdin;
            while running_for_stdin.load(Ordering::Acquire) {
                match stdin_rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(StdinMessage::Command(json)) => {
                        tracing::debug!("Writing to stdin: {}", &json[..json.len().min(100)]);
                        if let Err(e) = writeln!(stdin, "{}", json) {
                            tracing::error!("{}", e);
                            break;
                        }
                        if let Err(e) = stdin.flush() {
                            tracing::error!("{}", e);
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
            tracing::debug!("Stdin writer thread exiting");
        });

        // Start event reader thread
        let running = self.running.clone();
        if let Some(channel) = channel {
            // Channel mode: send events through the Tauri Channel
            thread::spawn(move || {
                read_events_with_channel(stdout, channel, running.clone());
            });
        } else {
            // Legacy mode: emit Tauri events
            thread::spawn(move || {
                read_events(stdout, app_handle.clone(), running.clone());
            });
        }

        // Start stderr reader thread for debugging
        thread::spawn(move || {
            let buf_reader = BufReader::new(stderr);
            for line in buf_reader.lines() {
                if let Ok(line) = line {
                    if !line.trim().is_empty() {
                        tracing::error!("[stderr] {}", line);
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
        self.running.load(Ordering::Acquire)
    }

    pub fn kill(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::Release);
        // Send quit signal to stdin writer thread
        if let Some(sender) = self.stdin_sender.take() {
            let _ = sender.send(StdinMessage::Quit);
        }
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

/// Read events from pi's stdout and send through a Tauri Channel.
/// This is more efficient than emitting individual events.
fn read_events_with_channel(reader: impl Read + Send + 'static, channel: Channel<StreamEvent>, running: Arc<AtomicBool>) {
    let buf_reader = BufReader::new(reader);

    for line in buf_reader.lines() {
        if !running.load(Ordering::Acquire) {
            break;
        }

        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        // Send the raw JSON line through the channel
        let event = StreamEvent { payload: line };
        if channel.send(event).is_err() {
            // Channel closed (frontend disconnected)
            tracing::debug!("Channel closed, stopping event reader");
            break;
        }
    }

    running.store(false, Ordering::Release);
}

/// Read events from pi's stdout and emit Tauri events (legacy mode).
fn read_events(reader: impl Read + Send + 'static, app_handle: AppHandle, running: Arc<AtomicBool>) {
    let buf_reader = BufReader::new(reader);

    for line in buf_reader.lines() {
        if !running.load(Ordering::Acquire) {
            break;
        }

        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        // ── High-frequency events: emit ONLY dedicated event, skip pi:raw ──
        // message_update and tool_execution_update are the most frequent during streaming.
        // Emitting pi:raw for these doubles the IPC traffic and JSON.parse overhead.
        if line.contains(r#""type":"message_update""#) {
            let _ = app_handle.emit("pi:message_update", &line);
            continue;
        }
        if line.contains(r#""type":"tool_execution_update""#) {
            let _ = app_handle.emit("pi:tool_execution_update", &line);
            continue;
        }

        // ── Low-frequency events: emit both pi:raw (debug) and dedicated event ──
        let _ = app_handle.emit("pi:raw", &line);

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

    running.store(false, Ordering::Release);
    let _ = app_handle.emit("pi:process_exit", "");
}