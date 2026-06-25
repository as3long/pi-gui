import { invoke } from '@tauri-apps/api/core'
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

// ── Tauri Command Wrappers ──

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

// ── Event Listeners ──

let unlistenRaw: UnlistenFn | null = null
const eventHandlers: Map<string, Array<(event: RpcEvent) => void>> = new Map()

/**
 * Start listening to pi events from the Rust backend.
 * Returns a cleanup function.
 */
export async function startEventListeners(): Promise<() => void> {
  console.log('[PiGUI] Starting event listeners...')
  console.log('[PiGUI] Current event handlers:', eventHandlers.size)
  // Listen to raw JSON lines
  unlistenRaw = await listen<string>('pi:raw', (event) => {
    console.log('[PiGUI] Raw event received:', event.payload?.substring(0, 100))
    try {
      const parsed = JSON.parse(event.payload) as RpcEvent
      console.log('[PiGUI] Parsed event type:', parsed.type)
      const handlers = eventHandlers.get(parsed.type) || []
      console.log('[PiGUI] Handlers for', parsed.type, ':', handlers.length)
      for (const handler of handlers) {
        console.log('[PiGUI] Calling handler for:', parsed.type)
        handler(parsed)
      }
      // Also notify wildcard handlers
      const wildcardHandlers = eventHandlers.get('*') || []
      console.log('[PiGUI] Wildcard handlers:', wildcardHandlers.length)
      for (const handler of wildcardHandlers) {
        console.log('[PiGUI] Calling wildcard handler for:', parsed.type)
        handler(parsed)
      }
      // Forward extension UI requests to UI store
      if (parsed.type === 'extension_ui_request') {
        const uiStore = useUiStore()
        uiStore.setRequest(parsed)
      }
    } catch (e) {
      console.error('[PiGUI] Failed to parse pi event:', e)
    }
  })
  console.log('[PiGUI] Event listeners started')

  return () => {
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
  console.log('[PiGUI] Registering event handler for:', type)
  const handlers = eventHandlers.get(type) || []
  handlers.push(handler)
  eventHandlers.set(type, handlers)
  console.log('[PiGUI] Total handlers for', type, ':', handlers.length)

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
