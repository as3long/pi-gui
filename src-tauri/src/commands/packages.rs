use std::process::Stdio;

/// Install a pi package (async).
///
/// Spawns the installation as a non-blocking process and
/// streams output to avoid blocking the UI thread.
#[tauri::command]
pub async fn pi_install_package(source: String) -> Result<serde_json::Value, String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let pi_path = super::config::find_pi_binary()?;

    tracing::info!("Installing package from: {}", source);

    let mut cmd = if pi_path.ends_with(".ps1") {
        let mut c = Command::new("powershell.exe");
        c.args(&[
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &pi_path,
            "install",
            &source,
        ]);
        c
    } else {
        let mut c = Command::new(&pi_path);
        c.args(&["install", &source]);
        c
    };

    // Hide console window on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn install process: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    // Read output asynchronously
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let mut output = Vec::new();

    loop {
        tokio::select! {
            line = stdout_reader.next_line() => {
                match line {
                    Ok(Some(line)) => {
                        tracing::info!("[Pi install] {}", line);
                        output.push(line);
                    }
                    Ok(None) => break,
                    Err(e) => {
                        tracing::error!("{}", e);
                        break;
                    }
                }
            }
            line = stderr_reader.next_line() => {
                match line {
                    Ok(Some(line)) => {
                        tracing::error!("[Pi install err] {}", line);
                    }
                    Ok(None) => {}
                    Err(e) => {
                        tracing::error!("{}", e);
                    }
                }
            }
        }
    }

    // Wait for process to finish
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Install process failed: {}", e))?;

    if !status.success() {
        return Err(format!("Install failed with status: {}", status));
    }

    Ok(serde_json::json!({
        "success": true,
        "source": source,
        "output": output,
    }))
}

/// List installed pi packages (async).
#[tauri::command]
pub async fn pi_list_packages() -> Result<Vec<String>, String> {
    use tokio::process::Command;

    let pi_path = super::config::find_pi_binary()?;

    let mut cmd = if pi_path.ends_with(".ps1") {
        let mut c = Command::new("powershell.exe");
        c.args(&[
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &pi_path,
            "list-packages",
        ]);
        c
    } else {
        let mut c = Command::new(&pi_path);
        c.args(&["list-packages"]);
        c
    };

    // Hide console window on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to list packages: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("list-packages failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let packages: Vec<String> = stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(packages)
}
