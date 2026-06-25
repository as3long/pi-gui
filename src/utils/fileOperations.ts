/**
 * File operations utility for Pi GUI
 * Handles file system interactions through Tauri commands
 */

import { invoke } from '@tauri-apps/api/core'

export interface FileContent {
  path: string
  content: string
  encoding?: string
}

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  lastModified: string
}

/**
 * Read file content
 */
export async function readFile(path: string): Promise<string> {
  try {
    const content = await invoke<string>('read_file', { path })
    return content
  } catch (error) {
    console.error('Failed to read file:', error)
    throw error
  }
}

/**
 * Write file content
 */
export async function writeFile(path: string, content: string): Promise<void> {
  try {
    await invoke('write_file', { path, content })
  } catch (error) {
    console.error('Failed to write file:', error)
    throw error
  }
}

/**
 * Create directory
 */
export async function createDirectory(path: string): Promise<void> {
  try {
    await invoke('create_directory', { path })
  } catch (error) {
    console.error('Failed to create directory:', error)
    throw error
  }
}

/**
 * Delete file or directory
 */
export async function deleteFile(path: string): Promise<void> {
  try {
    await invoke('delete_file', { path })
  } catch (error) {
    console.error('Failed to delete file:', error)
    throw error
  }
}

/**
 * Rename file or directory
 */
export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  try {
    await invoke('rename_file', { oldPath, newPath })
  } catch (error) {
    console.error('Failed to rename file:', error)
    throw error
  }
}

/**
 * List directory contents
 */
export async function listDirectory(path: string): Promise<FileInfo[]> {
  try {
    const files = await invoke<FileInfo[]>('list_directory', { path })
    return files
  } catch (error) {
    console.error('Failed to list directory:', error)
    throw error
  }
}

/**
 * Check if file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    const exists = await invoke<boolean>('file_exists', { path })
    return exists
  } catch (error) {
    console.error('Failed to check file existence:', error)
    throw error
  }
}

/**
 * Get file info
 */
export async function getFileInfo(path: string): Promise<FileInfo> {
  try {
    const info = await invoke<FileInfo>('get_file_info', { path })
    return info
  } catch (error) {
    console.error('Failed to get file info:', error)
    throw error
  }
}

/**
 * Watch file changes
 */
export async function watchFile(
  path: string,
  callback: (event: string) => void
): Promise<() => void> {
  try {
    const unwatch = await invoke<() => void>('watch_file', { path, callback })
    return unwatch
  } catch (error) {
    console.error('Failed to watch file:', error)
    throw error
  }
}

/**
 * Open file dialog
 */
export async function openFileDialog(options?: {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  multiple?: boolean
}): Promise<string | string[]> {
  try {
    const result = await invoke<string | string[]>('open_file_dialog', { options })
    return result
  } catch (error) {
    console.error('Failed to open file dialog:', error)
    throw error
  }
}

/**
 * Save file dialog
 */
export async function saveFileDialog(options?: {
  title?: string
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}): Promise<string | null> {
  try {
    const result = await invoke<string | null>('save_file_dialog', { options })
    return result
  } catch (error) {
    console.error('Failed to open save dialog:', error)
    throw error
  }
}
