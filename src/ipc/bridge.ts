import { invoke, Channel } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  RpcEvent,
  ImageContent,
  SessionSnapshot,
  SessionRef,
  WorkspaceRef,
  SessionTreeSnapshot,
  SessionMessageInput,
  CreateSessionOptions,
  SessionModelSelection,
  NavigateSessionTreeOptions,
  NavigateSessionTreeResult,
  HostUiResponse,
} from './types'
import { useUiStore } from '../stores/ui'
import { createLogger } from '../utils/logger'

const logger = createLogger('Bridge')

// ── Streaming Event Type (matches Rust StreamEvent) ──
interface StreamEvent {
  payload: string
}

// ── Streaming State ──
let streamingChannel: Channel<StreamEvent> | null = null
let streamingPromise: Promise<unknown> | null = null

// ── Event Handlers ──
const eventHandlers: Map<string, Array<(event: RpcEvent) => void>> = new Map()

/**
 * Fast lightweight JSON parsing for high-frequency streaming events
 */
function fastParseEventType(payload: string): string {
  const typeMatch = payload.match(/"type"\s*:\s*"([^"]+)"/)
  return typeMatch ? typeMatch[1] : ''
}

/**
 * Dispatch a parsed event to registered handlers.
 */
function dispatchEvent(parsed: RpcEvent): void {
  const specificHandlers = eventHandlers.get(parsed.type) || []
  const wildcardHandlers = eventHandlers.get('*') || []

  for (const handler of specificHandlers) {
    handler(parsed)
  }
  for (const handler of wildcardHandlers) {
    handler(parsed)
  }
}

/**
 * Handle a raw event payload from the channel.
 */
function handleRawPayload(payload: string): void {
  if (!payload) return

  // Fast path: extract event type without full JSON parsing
  const eventType = fastParseEventType(payload)
  
  // Check if we have any handlers for this event type
  const specificHandlers = eventHandlers.get(eventType) || []
  const wildcardHandlers = eventHandlers.get('*') || []
  
  // Only do full JSON parsing if we have actual handlers
  if (specificHandlers.length === 0 && wildcardHandlers.length === 0 && eventType !== 'extension_ui_request') {
    return
  }
  
  // Log important events
  const importantTypes = ['agent_start', 'agent_end', 'error', 'compaction_start', 'compaction_end']
  if (importantTypes.includes(eventType)) {
    logger.debug(`Received event: ${eventType}`)
  }

  try {
    // Full parsing only when needed
    const parsed = JSON.parse(payload) as RpcEvent

    dispatchEvent(parsed)

    // Forward extension UI requests to UI store
    if (parsed.type === 'extension_ui_request') {
      const req = parsed as any
      
      // Skip non-interactive requests early to avoid unnecessary processing
      const skipMethods = ['status', 'widget', 'progress', 'status_update', 'setStatus']
      const hasNoUserContent = !req.title && !req.message && !req.options && !req.placeholder && !req.prefill
      
      if (!req.method || skipMethods.includes(req.method) || (hasNoUserContent && req.status_key) || hasNoUserContent) {
        return
      }
      
      // Handle notify method - show toast notification via window
      if (req.method === 'notify' && req.message) {
        if ((window as any).__piNotify) {
          (window as any).__piNotify('info', req.message)
        }
        return
      }
      
      const uiStore = useUiStore()
      uiStore.setRequest(parsed)
    }
  } catch (e) {
    // Swallow parse errors for high-frequency events to avoid log spam
  }
}

// ── Tauri Command Wrappers ──

/**
 * Start pi process with streaming via Channel API.
 * This is the preferred method for efficient streaming.
 * 
 * @param cwd - Working directory for the pi process
 * @returns A cleanup function to stop streaming
 */
export async function piStartStreaming(cwd: string): Promise<() => void> {
  // Don't start if already streaming
  if (streamingChannel && streamingPromise) {
    logger.warn('Already streaming, ignoring duplicate start')
    return () => {}
  }

  logger.info('Starting pi with Channel API streaming', { cwd })

  // Create a new channel
  const channel = new Channel<StreamEvent>()
  streamingChannel = channel

  // Set up the message handler
  channel.onmessage = (event: StreamEvent) => {
    handleRawPayload(event.payload)
  }

  // Start the streaming command (this is a long-running command)
  streamingPromise = invoke('pi_start_streaming', { cwd, channel })
    .catch((e) => {
      logger.error('Streaming command failed:', e)
      cleanup()
    })

  // Return a cleanup function
  function cleanup() {
    streamingChannel = null
    streamingPromise = null
  }

  return cleanup
}

/**
 * Start pi process with legacy event emission.
 * @deprecated Use piStartStreaming instead for better performance.
 */
export async function piStart(cwd: string): Promise<void> {
  await invoke('pi_start', { cwd })
}

export async function piStop(): Promise<void> {
  await invoke('pi_stop')
}

export async function piIsRunning(): Promise<boolean> {
  return await invoke<boolean>('pi_is_running')
}

export async function piPrompt(id: string, message: string): Promise<void> {
  await invoke('pi_prompt', { id, message })
}

/**
 * Prompt with attached images (used for clipboard paste).
 */
export async function piPromptWithImages(id: string, message: string, images: ImageContent[]): Promise<void> {
  await invoke('pi_prompt', { id, message, images })
}

export async function piSteer(id: string, message: string): Promise<void> {
  await invoke('pi_steer', { id, message })
}

export async function piFollowUp(id: string, message: string): Promise<void> {
  await invoke('pi_follow_up', { id, message })
}

export async function piAbort(): Promise<void> {
  await invoke('pi_abort')
}

export async function piGetState(): Promise<void> {
  await invoke('pi_get_state')
}

export async function piGetMessages(): Promise<void> {
  await invoke('pi_get_messages')
}

export async function piSetModel(provider: string, modelId: string): Promise<void> {
  await invoke('pi_set_model', { provider, modelId })
}

export async function piCycleModel(): Promise<void> {
  await invoke('pi_cycle_model')
}

export async function piGetAvailableModels(): Promise<any[]> {
  const result = await invoke<any>('pi_get_available_models')
  return result
}

export async function piSetThinkingLevel(level: string): Promise<void> {
  await invoke('pi_set_thinking_level', { level })
}

export async function piNewSession(): Promise<void> {
  await invoke('pi_new_session')
}

export async function piSwitchSession(sessionPath: string): Promise<void> {
  await invoke('pi_switch_session', { sessionPath })
}

export async function piFork(entryId: string): Promise<void> {
  await invoke('pi_fork', { entryId })
}

export async function piGetSessionStats(): Promise<void> {
  await invoke('pi_get_session_stats')
}

export async function piListSessions(): Promise<void> {
  try {
    await invoke('pi_list_sessions')
  } catch (e) {
    // list_sessions may not be supported by pi
    console.warn('[PiGUI] list_sessions not supported:', e)
  }
}

export async function piExtensionUiResponse(
  id: string,
  value?: string,
  confirmed?: boolean,
  cancelled?: boolean,
): Promise<void> {
  await invoke('pi_extension_ui_response', { id, value, confirmed, cancelled })
}

export async function piDeleteFile(path: string): Promise<void> {
  await invoke('pi_delete_file', { path })
}

export async function piReadDirectory(path: string, maxDepth?: number): Promise<any> {
  return await invoke<any>('pi_read_directory', { path, maxDepth })
}

export async function piReadSession(path: string): Promise<any> {
  return await invoke<any>('pi_read_session', { path })
}

export async function piReadSessionMetadata(path: string, maxLines?: number): Promise<any> {
  return await invoke<any>('pi_read_session_metadata', { path, maxLines })
}

// ── Session Driver Commands ──

export async function piCreateSession(workspace: WorkspaceRef, options?: CreateSessionOptions): Promise<SessionSnapshot> {
  return await invoke<SessionSnapshot>('pi_create_session', { workspace, options })
}

export async function piOpenSession(sessionRef: SessionRef): Promise<SessionSnapshot> {
  return await invoke<SessionSnapshot>('pi_open_session', { sessionRef })
}

export async function piArchiveSession(sessionRef: SessionRef): Promise<void> {
  await invoke('pi_archive_session', { sessionRef })
}

export async function piUnarchiveSession(sessionRef: SessionRef): Promise<void> {
  await invoke('pi_unarchive_session', { sessionRef })
}

export async function piSendUserMessage(sessionRef: SessionRef, input: SessionMessageInput): Promise<void> {
  await invoke('pi_send_user_message', { sessionRef, input })
}

export async function piCancelCurrentRun(sessionRef: SessionRef): Promise<void> {
  await invoke('pi_cancel_current_run', { sessionRef })
}

export async function piSetSessionModel(sessionRef: SessionRef, selection: SessionModelSelection): Promise<void> {
  await invoke('pi_set_session_model', { sessionRef, selection })
}

export async function piSetSessionThinkingLevel(sessionRef: SessionRef, thinkingLevel: string): Promise<void> {
  await invoke('pi_set_session_thinking_level', { sessionRef, thinkingLevel })
}

export async function piRenameSession(sessionRef: SessionRef, title: string): Promise<void> {
  await invoke('pi_rename_session', { sessionRef, title })
}

export async function piCompactSession(sessionRef: SessionRef, customInstructions?: string): Promise<void> {
  await invoke('pi_compact_session', { sessionRef, customInstructions })
}

export async function piReloadSession(sessionRef: SessionRef): Promise<void> {
  await invoke('pi_reload_session', { sessionRef })
}

export async function piGetSessionTree(sessionRef: SessionRef): Promise<SessionTreeSnapshot> {
  return await invoke<SessionTreeSnapshot>('pi_get_session_tree', { sessionRef })
}

export async function piNavigateSessionTree(
  sessionRef: SessionRef,
  targetId: string,
  options?: NavigateSessionTreeOptions,
): Promise<NavigateSessionTreeResult> {
  return await invoke<NavigateSessionTreeResult>('pi_navigate_session_tree', { sessionRef, targetId, options })
}

export async function piRespondToHostUiRequest(sessionRef: SessionRef, response: HostUiResponse): Promise<void> {
  await invoke('pi_respond_to_host_ui_request', { sessionRef, response })
}

export async function piCloseSession(sessionRef: SessionRef): Promise<void> {
  await invoke('pi_close_session', { sessionRef })
}

// ── Pi Agent Config ──

export interface PiAgentSettings {
  lastChangelogVersion?: string
  defaultProvider?: string
  defaultModel?: string
  defaultThinkingLevel?: string
  shellPath?: string
  terminal?: {
    showTerminalProgress?: boolean
  }
}

export interface PiAgentAuth {
  [provider: string]: {
    type: string
    key: string
  }
}

export async function piGetAgentSettings(): Promise<PiAgentSettings> {
  return await invoke<PiAgentSettings>('pi_get_agent_settings')
}

export async function piSetAgentSettings(settings: PiAgentSettings): Promise<void> {
  await invoke('pi_set_agent_settings', { settings })
}

export async function piGetAgentAuth(): Promise<PiAgentAuth> {
  return await invoke<PiAgentAuth>('pi_get_agent_auth')
}
export async function piSetAgentAuth(auth: Record<string, { type: string; key: string }>): Promise<void> {
  await invoke('pi_set_agent_auth', { auth })
}

export async function piGetHomeDir(): Promise<string> {
  return await invoke<string>('pi_get_home_dir')
}

export async function piInstallPackage(source: string): Promise<any> {
  return await invoke<any>('pi_install_package', { source })
}

export async function piListPackages(): Promise<string[]> {
  return await invoke<string[]>('pi_list_packages')
}

// ── Legacy Event Listeners (for backward compatibility) ──

let unlistenRaw: UnlistenFn | null = null
let unlistenMessageUpdate: UnlistenFn | null = null
let unlistenToolExecutionUpdate: UnlistenFn | null = null

/**
 * Start listening to pi events from the Rust backend (legacy mode).
 * @deprecated Use piStartStreaming instead for better performance.
 * Returns a cleanup function.
 */
export async function startEventListeners(): Promise<() => void> {
  console.log('[PiGUI] Starting legacy event listeners...')

  // ── High-frequency: message_update ──
  unlistenMessageUpdate = await listen<string>('pi:message_update', (event) => {
    handleRawPayload(event.payload)
  })

  // ── High-frequency: tool_execution_update ──
  unlistenToolExecutionUpdate = await listen<string>('pi:tool_execution_update', (event) => {
    handleRawPayload(event.payload)
  })

  // ── Low-frequency: all other events via pi:raw ──
  unlistenRaw = await listen<string>('pi:raw', (event) => {
    handleRawPayload(event.payload)
  })

  console.log('[PiGUI] Legacy event listeners started')

  return () => {
    if (unlistenMessageUpdate) {
      unlistenMessageUpdate()
      unlistenMessageUpdate = null
    }
    if (unlistenToolExecutionUpdate) {
      unlistenToolExecutionUpdate()
      unlistenToolExecutionUpdate = null
    }
    if (unlistenRaw) {
      unlistenRaw()
      unlistenRaw = null
    }
  }
}

/**
 * Register a handler for a specific event type.
 * Use '*' for all events.
 */
export function onPiEvent(type: string, handler: (event: RpcEvent) => void): () => void {
  const handlers = eventHandlers.get(type) || []
  handlers.push(handler)
  eventHandlers.set(type, handlers)

  return () => {
    const hs = eventHandlers.get(type)
    if (hs) {
      const idx = hs.indexOf(handler)
      if (idx !== -1) hs.splice(idx, 1)
      if (hs.length === 0) eventHandlers.delete(type)
    }
  }
}

/**
 * Remove all event handlers.
 */
export function clearEventHandlers(): void {
  eventHandlers.clear()
}
