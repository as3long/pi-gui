/**
 * Logger utility for debugging and diagnosing UI freezes
 * Uses efficient append mode to avoid reading entire log file on each flush.
 */

import { invoke } from '@tauri-apps/api/core'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB max log size
const LOG_DIR = '.pi-gui'
const LOG_FILE = 'debug.log'
let logFilePath: string | null = null
let initPromise: Promise<string | null> | null = null
let currentLogSize = 0 // Track approximate log size

// In-memory log buffer for performance (flushed to disk periodically)
const logBuffer: string[] = []
let flushTimeout: number | null = null
let isFlushing = false

// Get user home directory from Tauri directly
async function getHomeDir(): Promise<string> {
  try {
    return await invoke<string>('pi_get_home_dir')
  } catch {
    return 'C:\\Users\\huoying'
  }
}

// Initialize log file path and check current size
async function initLogPath(): Promise<string | null> {
  if (logFilePath) return logFilePath
  if (initPromise) return initPromise
  
  initPromise = (async () => {
    try {
      const home = await getHomeDir()
      const logDirPath = `${home}\\${LOG_DIR}`
      logFilePath = `${logDirPath}\\${LOG_FILE}`
      
      // Create directory using Rust command
      try {
        await invoke('create_dir_all', { path: logDirPath })
      } catch (e) {
        // Directory might already exist
      }
      
      // Get current file size
      try {
        currentLogSize = await invoke<number>('get_file_size', { path: logFilePath })
      } catch {
        currentLogSize = 0
      }
      
      return logFilePath
    } catch (e) {
      console.error('[Logger] Failed to initialize log path:', e)
      return null
    }
  })()
  
  return initPromise
}

// Flush buffer to disk using efficient append mode
async function flushLogs() {
  if (isFlushing || logBuffer.length === 0) return
  
  isFlushing = true
  const logsToWrite = [...logBuffer]
  logBuffer.length = 0
  
  try {
    const path = await initLogPath()
    if (!path) {
      console.warn('[Logger] No log path available, keeping in memory')
      logBuffer.unshift(...logsToWrite)
      isFlushing = false
      return
    }
    
    // Check if we need to rotate
    if (currentLogSize > MAX_LOG_SIZE) {
      // Truncate to last 80% of max size
      await invoke('truncate_file', { path })
      currentLogSize = 0
      // Add rotation marker
      const marker = '... [LOG ROTATED - OLDER ENTRIES REMOVED] ...\n'
      await invoke('append_to_file', { path, content: marker })
      currentLogSize += marker.length
    }
    
    // Append new logs (efficient - no read needed)
    const content = logsToWrite.join('\n') + '\n'
    await invoke('append_to_file', { path, content })
    currentLogSize += content.length
    
  } catch (e) {
    console.error('[Logger] Failed to flush logs:', e)
    // Put logs back into buffer to retry later
    logBuffer.unshift(...logsToWrite)
  } finally {
    isFlushing = false
  }
}

// Schedule flush after a delay to batch writes
function scheduleFlush() {
  if (flushTimeout) return
  flushTimeout = window.setTimeout(async () => {
    flushTimeout = null
    await flushLogs()
  }, 2000) as unknown as number  // 2 seconds instead of 1 second
}

// Force flush all pending logs immediately
export async function flushLogsNow() {
  if (flushTimeout) {
    clearTimeout(flushTimeout as unknown as number)
    flushTimeout = null
  }
  await flushLogs()
}

class Logger {
  private module: string

  constructor(module: string) {
    this.module = module
  }

  private formatTimestamp(): string {
    const now = new Date()
    return now.toISOString()
  }

  private log(level: LogLevel, message: string, data?: any) {
    const timestamp = this.formatTimestamp()
    
    // Format log line
    let logLine = `[${timestamp}] [${level.toUpperCase()}] [${this.module}] ${message}`
    if (data !== undefined) {
      try {
        logLine += ` ${JSON.stringify(data)}`
      } catch {
        logLine += ' [Circular/Unserializable data]'
      }
    }
    
    // Add to buffer and schedule write
    logBuffer.push(logLine)
    scheduleFlush()
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data)
  }

  info(message: string, data?: any) {
    this.log('info', message, data)
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data)
  }

  error(message: string, data?: any) {
    this.log('error', message, data)
  }

  // Performance monitoring
  private performanceMarks: Map<string, number> = new Map()

  startMeasure(markName: string) {
    this.performanceMarks.set(markName, performance.now())
    this.debug(`[PERF] Starting measure: ${markName}`)
  }

  endMeasure(markName: string, warnThresholdMs = 100) {
    const startTime = this.performanceMarks.get(markName)
    if (startTime === undefined) {
      this.warn(`[PERF] Mark not found: ${markName}`)
      return
    }

    const duration = performance.now() - startTime
    this.performanceMarks.delete(markName)

    if (duration > warnThresholdMs) {
      this.warn(`[PERF] ${markName} took ${duration.toFixed(2)}ms (exceeds threshold of ${warnThresholdMs}ms)`)
    } else {
      this.debug(`[PERF] ${markName} took ${duration.toFixed(2)}ms`)
    }

    return duration
  }
}

// Create module-specific loggers
export const createLogger = (module: string) => new Logger(module)

// Get log file path
export async function getLogFilePath(): Promise<string | null> {
  return await initLogPath()
}

// Read current log content (only when user explicitly requests it)
export async function getLogContent(): Promise<string> {
  const path = await initLogPath()
  if (!path) return 'Log file not initialized'
  
  try {
    // Flush any pending logs first
    await flushLogsNow()
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return await readTextFile(path)
  } catch (e) {
    return `Error reading log file: ${e}`
  }
}

// Watchdog for UI responsiveness
class UiWatchdog {
  private lastPulse = performance.now()
  private pulseInterval: number | null = null
  private logger: Logger
  private freezeThreshold = 1000 // 1 second

  constructor(logger: Logger) {
    this.logger = logger
  }

  start() {
    this.logger.info('[WATCHDOG] UI responsiveness watchdog started')
    
    // Pulse every 100ms to check if main thread is responsive
    this.pulseInterval = window.setInterval(() => {
      const now = performance.now()
      const delta = now - this.lastPulse
      
      // If we're more than threshold behind, the UI was blocked
      if (delta > this.freezeThreshold) {
        this.logger.warn(`[WATCHDOG] UI was blocked for ${delta.toFixed(0)}ms! (threshold: ${this.freezeThreshold}ms)`)
      }
      
      this.lastPulse = now
    }, 100) as unknown as number
  }

  stop() {
    if (this.pulseInterval) {
      clearInterval(this.pulseInterval)
      this.pulseInterval = null
      this.logger.info('[WATCHDOG] UI responsiveness watchdog stopped')
    }
  }
}

export const createWatchdog = (logger: Logger) => new UiWatchdog(logger)

// Initialize on startup
setTimeout(async () => {
  console.log('[Logger] Starting initialization...')
  const path = await initLogPath()
  if (path) {
    const startupLog = new Logger('Logger')
    startupLog.info('Logger system initialized')
    startupLog.info(`Log file location: ${path}`)
  }
}, 500)

// Flush logs on page unload
window.addEventListener('beforeunload', () => {
  flushLogsNow()
})
