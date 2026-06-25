import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SessionInfo, SessionStats, UiState, ModelInfo, ThinkingLevel, QueueMode, RpcEvent } from '../ipc/types'

/**
 * Session store manages pi session lifecycle and UI state.
 */
export const useSessionStore = defineStore('session', () => {
  // ── State ──
  const sessions = ref<SessionInfo[]>([])
  const currentSessionId = ref<string | null>(null)
  const currentSessionFile = ref<string | null>(null)
  const sessionName = ref<string | null>(null)
  const stats = ref<SessionStats | null>(null)

  // UI State
  const isRunning = ref(false)
  const currentModel = ref<ModelInfo | null>(null)
  const thinkingLevel = ref<ThinkingLevel>('medium')
  const steeringMode = ref<QueueMode>('one-at-a-time')
  const followUpMode = ref<QueueMode>('one-at-a-time')

  // Error / info messages
  const lastError = ref<string | null>(null)

  // ── Actions ──

  function handleEvent(event: RpcEvent) {
    if (event.type === 'response') {
      const data = event.data as UiState | undefined
      if (data && 'sessionId' in data) {
        currentSessionId.value = data.sessionId
        currentSessionFile.value = data.sessionFile
        sessionName.value = data.sessionName
        currentModel.value = data.model
        thinkingLevel.value = data.thinkingLevel as ThinkingLevel
        steeringMode.value = data.steeringMode as QueueMode
        followUpMode.value = data.followUpMode as QueueMode
      }
    }

    if (event.type === 'response' && !event.success) {
      lastError.value = event.error || 'Unknown error'
    }
  }

  function setSessions(list: SessionInfo[]) {
    sessions.value = list
  }

  function setStats(s: SessionStats) {
    stats.value = s
  }

  function clearError() {
    lastError.value = null
  }

  return {
    // State
    sessions,
    currentSessionId,
    currentSessionFile,
    sessionName,
    stats,
    isRunning,
    currentModel,
    thinkingLevel,
    steeringMode,
    followUpMode,
    lastError,

    // Actions
    handleEvent,
    setSessions,
    setStats,
    clearError,
  }
})
