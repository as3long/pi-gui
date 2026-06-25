import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { RpcEvent, ImageContent } from './types'
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

export async function piGetAvailableModels(): Promise<void> {
  await invoke('pi_get_available_models')
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
  await invoke('pi_list_sessions')
}

export async function piExtensionUiResponse(
  id: string,
  value?: string,
  confirmed?: boolean,
  cancelled?: boolean,
): Promise<void> {
  await invoke('pi_extension_ui_response', { id, value, confirmed, cancelled })
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

// ── Event Listeners ──

let unlistenRaw: UnlistenFn | null = null
const eventHandlers: Map<string, Array<(event: RpcEvent) => void>> = new Map()

/**
 * Start listening to pi events from the Rust backend.
 * Returns a cleanup function.
 */
export async function startEventListeners(): Promise<() => void> {
  // Listen to raw JSON lines
  unlistenRaw = await listen<string>('pi:raw', (event) => {
    try {
      const parsed = JSON.parse(event.payload) as RpcEvent
      const handlers = eventHandlers.get(parsed.type) || []
      for (const handler of handlers) {
        handler(parsed)
      }
      // Also notify wildcard handlers
      const wildcardHandlers = eventHandlers.get('*') || []
      for (const handler of wildcardHandlers) {
        handler(parsed)
      }
      // Forward extension UI requests to UI store
      if (parsed.type === 'extension_ui_request') {
        const uiStore = useUiStore()
        uiStore.setRequest(parsed)
      }
    } catch (e) {
      console.error('Failed to parse pi event:', e)
    }
  })

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
