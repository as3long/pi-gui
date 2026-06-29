use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

/// Create a directory and all its parent directories (async).
#[tauri::command]
pub async fn create_dir_all(path: String) -> Result<(), String> {
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))
}

/// Delete a file (async using tokio fs).
#[tauri::command]
pub async fn pi_delete_file(path: String) -> Result<(), String> {
    tokio::fs::remove_file(&path)
        .await
        .map_err(|e| format!("Failed to delete file: {}", e))
}

/// Read directory contents (async using tokio fs).
#[tauri::command]
pub async fn pi_read_directory(
    path: String,
    max_depth: Option<u32>,
) -> Result<Vec<serde_json::Value>, String> {
    let base_path = PathBuf::from(&path);
    let max_depth = max_depth.unwrap_or(3);
    Box::pin(read_dir_recursive(base_path, 0, max_depth)).await
}

/// Recursively read directory contents (boxed async recursion).
async fn read_dir_recursive(
    path: PathBuf,
    depth: u32,
    max_depth: u32,
) -> Result<Vec<serde_json::Value>, String> {
    if depth >= max_depth {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    while let Ok(Some(entry)) = dir.next_entry().await {
        let file_type = entry
            .file_type()
            .await
            .map_err(|e| format!("Failed to get file type: {}", e))?;

        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path();
        let path_str = entry_path.to_string_lossy().to_string();

        if file_type.is_dir() {
            let children = if depth + 1 < max_depth {
                Box::pin(read_dir_recursive(entry_path, depth + 1, max_depth)).await?
            } else {
                vec![]
            };

            entries.push(serde_json::json!({
                "name": name,
                "path": path_str,
                "type": "directory",
                "children": children,
            }));
        } else {
            let size = if let Ok(meta) = entry.metadata().await {
                meta.len()
            } else {
                0
            };

            entries.push(serde_json::json!({
                "name": name,
                "path": path_str,
                "type": "file",
                "size": size,
            }));
        }
    }

    Ok(entries)
}

/// Read session file content (async).
/// Detects format by first non-whitespace character:
/// - `[` → JSON array, parse as JSON
/// - `{` → single JSON object, wrap in array
/// - anything else → JSONL (one JSON per line)
#[tauri::command]
pub async fn pi_read_session(path: String) -> Result<serde_json::Value, String> {
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read session: {}", e))?;

    // Detect format by first non-whitespace character
    let first_char = content.trim_start().chars().next();

    match first_char {
        Some('[') => {
            // JSON array
            serde_json::from_str::<serde_json::Value>(&content)
                .map_err(|e| format!("Failed to parse JSON array: {}", e))
        }
        Some('{') => {
            // Single JSON object — try full parse, fallback to JSONL
            if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&content) {
                return Ok(obj);
            }
            // Fallback: treat as JSONL even though it starts with {
            parse_jsonl(&content)
        }
        _ => parse_jsonl(&content),
    }
}

/// Read only the first N lines of a session file (for metadata).
#[tauri::command]
pub async fn pi_read_session_metadata(
    path: String,
    max_lines: Option<usize>,
) -> Result<serde_json::Value, String> {
    let max_lines = max_lines.unwrap_or(20);

    use tokio::io::{AsyncBufReadExt, BufReader};

    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| format!("Failed to open session: {}", e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut messages = Vec::new();
    let mut line_count = 0;

    while let Ok(Some(line)) = lines.next_line().await {
        if line_count >= max_lines {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(msg) => {
                messages.push(msg);
                line_count += 1;
            }
            Err(e) => tracing::warn!(?e, "Failed to parse session metadata line"),
        }
    }

    Ok(serde_json::Value::Array(messages))
}

/// Parse JSONL content (one JSON object per line).
fn parse_jsonl(content: &str) -> Result<serde_json::Value, String> {
    let mut messages = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(msg) => messages.push(msg),
            Err(e) => tracing::warn!(?e, "Failed to parse session line"),
        }
    }
    Ok(serde_json::Value::Array(messages))
}

/// Append content to a file (efficient append mode).
/// Creates the file if it doesn't exist.
#[tauri::command]
pub async fn append_to_file(path: String, content: String) -> Result<(), String> {
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await
        .map_err(|e| format!("Failed to open file for append: {}", e))?;
    
    file.write_all(content.as_bytes())
        .await
        .map_err(|e| format!("Failed to append to file: {}", e))?;
    
    Ok(())
}

/// Truncate a file (clear its contents).
#[tauri::command]
pub async fn truncate_file(path: String) -> Result<(), String> {
    let file = tokio::fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(&path)
        .await
        .map_err(|e| format!("Failed to truncate file: {}", e))?;
    
    drop(file);
    Ok(())
}

/// Get file size.
#[tauri::command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    let meta = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    Ok(meta.len())
}
