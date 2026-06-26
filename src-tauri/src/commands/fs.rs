/// Delete a file or directory
#[tauri::command]
pub fn pi_delete_file(path: String) -> Result<(), String> {
    eprintln!("[PiGUI] Attempting to delete: {}", path);

    // On Windows, convert reserved device names (nul, con, aux, prn, com1-9, lpt1-9)
    // to use \\?\ prefix to bypass the OS-level name resolution
    #[cfg(target_os = "windows")]
    let fixed_path = {
        let p = std::path::Path::new(&path);
        if let Some(name) = p.file_name() {
            let name_str = name.to_string_lossy().to_lowercase();
            let reserved = [
                "nul", "con", "aux", "prn", "com1", "com2", "com3", "com4", "com5", "com6",
                "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7",
                "lpt8", "lpt9",
            ];
            if reserved.contains(&name_str.as_str()) {
                // Use \\?\ extended path prefix to bypass reserved name check
                let parent = p.parent().unwrap_or(std::path::Path::new("."));
                let extended = format!(
                    "\\\\?\\{}\\{}",
                    parent.display(),
                    name.to_string_lossy()
                );
                eprintln!(
                    "[PiGUI] Reserved device name detected, using extended path: {}",
                    extended
                );
                extended
            } else {
                path.clone()
            }
        } else {
            path.clone()
        }
    };
    #[cfg(not(target_os = "windows"))]
    let fixed_path = path.clone();

    let target = std::path::Path::new(&fixed_path);
    eprintln!("[PiGUI] Target exists: {}", target.exists());
    eprintln!("[PiGUI] Target is_dir: {}", target.is_dir());
    eprintln!("[PiGUI] Target is_file: {}", target.is_file());

    if !target.exists() {
        // Fallback: try the original path without \\?\ prefix
        let orig_target = std::path::Path::new(&path);
        if orig_target.exists() {
            eprintln!("[PiGUI] Original path exists, using it instead");
            return delete_path(orig_target, &path);
        }
        let err = format!("Path does not exist: {}", path);
        eprintln!("[PiGUI] {}", err);
        return Err(err);
    }

    delete_path(target, &path)
}

fn delete_path(target: &std::path::Path, display_path: &str) -> Result<(), String> {
    eprintln!("[PiGUI] Delete target: {:?}", target);
    eprintln!("[PiGUI] Target metadata: {:?}", target.metadata());

    let result = if target.is_dir() {
        std::fs::remove_dir_all(target)
            .map_err(|e| format!("Failed to delete directory {}: {}", display_path, e))
    } else {
        // On Windows, try to remove read-only attribute first
        #[cfg(target_os = "windows")]
        {
            if let Ok(metadata) = std::fs::metadata(target) {
                let perms = metadata.permissions();
                if perms.readonly() {
                    let mut new_perms = perms.clone();
                    new_perms.set_readonly(false);
                    let _ = std::fs::set_permissions(target, new_perms);
                }
            }
        }
        std::fs::remove_file(target)
            .map_err(|e| format!("Failed to delete file {}: {}", display_path, e))
    };
    if let Err(ref e) = result {
        eprintln!("[PiGUI] Delete failed: {}", e);
    } else {
        eprintln!("[PiGUI] Successfully deleted: {}", display_path);
    }
    result
}

/// Read directory contents as a tree structure
#[tauri::command]
pub fn pi_read_directory(path: String, max_depth: Option<u32>) -> Result<serde_json::Value, String> {
    let depth = max_depth.unwrap_or(3);
    read_dir_recursive(&path, depth, 0)
}

fn read_dir_recursive(
    path: &str,
    max_depth: u32,
    current_depth: u32,
) -> Result<serde_json::Value, String> {
    let dir_path = std::path::Path::new(path);
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<serde_json::Value> = Vec::new();

    if let Ok(read_dir) = std::fs::read_dir(dir_path) {
        for entry in read_dir.flatten() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files and common non-project directories
            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == ".git"
            {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let is_dir = metadata.is_dir();
            let entry_path_str = entry_path.to_string_lossy().to_string();

            // On Windows, use extended path for reserved device names
            #[cfg(target_os = "windows")]
            let display_path = {
                let name_lower = name.to_lowercase();
                let reserved = [
                    "nul", "con", "aux", "prn", "com1", "com2", "com3", "com4", "com5", "com6",
                    "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6",
                    "lpt7", "lpt8", "lpt9",
                ];
                if reserved.contains(&name_lower.as_str()) {
                    let parent = entry_path.parent().unwrap_or(std::path::Path::new("."));
                    format!("\\\\?\\{}\\{}", parent.display(), name)
                } else {
                    entry_path_str.clone()
                }
            };
            #[cfg(not(target_os = "windows"))]
            let display_path = entry_path_str.clone();

            let mut entry_obj = serde_json::json!({
                "name": name,
                "path": display_path,
                "type": if is_dir { "directory" } else { "file" },
            });

            // Add file extension
            if !is_dir {
                if let Some(ext) = entry_path.extension() {
                    entry_obj["extension"] = serde_json::json!(ext.to_string_lossy());
                }
                entry_obj["size"] = serde_json::json!(metadata.len());
            }

            // Recursively read subdirectories
            if is_dir && current_depth < max_depth {
                if let Ok(children) = read_dir_recursive(&display_path, max_depth, current_depth + 1)
                {
                    if let Some(arr) = children.as_array() {
                        entry_obj["children"] = serde_json::json!(arr);
                    }
                }
            }

            entries.push(entry_obj);
        }
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        let a_dir = a["type"].as_str() == Some("directory");
        let b_dir = b["type"].as_str() == Some("directory");
        if a_dir != b_dir {
            return b_dir.cmp(&a_dir);
        }
        let a_name = a["name"].as_str().unwrap_or("");
        let b_name = b["name"].as_str().unwrap_or("");
        a_name.to_lowercase().cmp(&b_name.to_lowercase())
    });

    Ok(serde_json::json!(entries))
}
