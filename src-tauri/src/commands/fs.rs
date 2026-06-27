use std::path::PathBuf;

/// Delete a file (async using tokio fs).
/// 
/// Uses tokio's async file system operations to avoid blocking
/// the main thread during I/O operations.
#[tauri::command]
pub async fn pi_delete_file(path: String) -> Result<(), String> {
    tokio::fs::remove_file(&path)
        .await
        .map_err(|e| format!("Failed to delete file: {}", e))
}

/// Read directory contents (async using tokio fs).
/// 
/// Returns a nested directory structure with file/directory info.
#[tauri::command]
pub async fn pi_read_directory(
    path: String,
    max_depth: Option<u32>,
) -> Result<Vec<serde_json::Value>, String> {
    let base_path = PathBuf::from(&path);
    let max_depth = max_depth.unwrap_or(3);
    
    // Use Box::pin to handle async recursion
    Box::pin(read_dir_recursive(base_path, 0, max_depth)).await
}

/// Recursively read directory contents (boxed async recursion).
/// 
/// Uses Box::pin to allow safe async recursion without infinite future size.
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
        let file_type = entry.file_type()
            .await
            .map_err(|e| format!("Failed to get file type: {}", e))?;
        
        let name = entry.file_name()
            .to_string_lossy()
            .to_string();
        
        let entry_path = entry.path();
        let path_str = entry_path.to_string_lossy().to_string();
        
        if file_type.is_dir() {
            // Recursive call with boxed future
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
/// Handles both JSONL format (one JSON per line) and regular JSON array.
#[tauri::command]
pub async fn pi_read_session(path: String) -> Result<serde_json::Value, String> {
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read session: {}", e))?;
    
    // First, try to parse as regular JSON (array or object)
    if let Ok(session) = serde_json::from_str::<serde_json::Value>(&content) {
        return Ok(session);
    }
    
    // If that fails, try JSONL format (one JSON object per line)
    let mut messages = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(msg) => messages.push(msg),
            Err(e) => eprintln!("Warning: Failed to parse session line: {}", e),
        }
    }
    
    Ok(serde_json::Value::Array(messages))
}
