import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ThinkingLevel } from '../ipc/types'

/**
 * Settings store persists user preferences across sessions.
 */
export const useSettingsStore = defineStore('settings', () => {
  // ── State ──
  const cwd = ref('')
  const provider = ref('')
  const modelId = ref('')
  const thinkingLevel = ref<ThinkingLevel>('medium')
  const autoCompaction = ref(true)
  const autoRetry = ref(true)
  const darkMode = ref(true)

  // Available models from pi
  const availableModels = ref<Array<{ id: string; name: string; provider: string; reasoning?: boolean }>>([])

  // ── Actions ──

  // Persist settings to localStorage (debounced)
  function persistSettings() {
    localStorage.setItem('pi-gui:cwd', cwd.value)
    localStorage.setItem('pi-gui:provider', provider.value)
    localStorage.setItem('pi-gui:modelId', modelId.value)
    localStorage.setItem('pi-gui:thinkingLevel', thinkingLevel.value)
    localStorage.setItem('pi-gui:darkMode', String(darkMode.value))
  }

  // Debounced persist - batches multiple rapid changes
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(persistSettings, 100)
  }

  function setCwd(path: string) {
    cwd.value = path
    schedulePersist()
  }

  function setProvider(p: string) {
    provider.value = p
    schedulePersist()
  }

  function setModelId(id: string) {
    modelId.value = id
    schedulePersist()
  }

  function setThinkingLevel(level: ThinkingLevel) {
    thinkingLevel.value = level
    schedulePersist()
  }

  function setAutoCompaction(enabled: boolean) {
    autoCompaction.value = enabled
  }

  function setAutoRetry(enabled: boolean) {
    autoRetry.value = enabled
  }

  function toggleDarkMode() {
    darkMode.value = !darkMode.value
    schedulePersist()
  }

  function setAvailableModels(models: Array<{ id: string; name: string; provider: string; reasoning?: boolean }>) {
    availableModels.value = models
  }

  // Load persisted settings from localStorage
  function loadPersisted() {
    cwd.value = localStorage.getItem('pi-gui:cwd') || ''
    provider.value = localStorage.getItem('pi-gui:provider') || ''
    modelId.value = localStorage.getItem('pi-gui:modelId') || ''
    const savedLevel = localStorage.getItem('pi-gui:thinkingLevel') as ThinkingLevel | null
    if (savedLevel) thinkingLevel.value = savedLevel
    const savedDark = localStorage.getItem('pi-gui:darkMode')
    if (savedDark !== null) darkMode.value = savedDark === 'true'
  }

  return {
    cwd,
    provider,
    modelId,
    thinkingLevel,
    autoCompaction,
    autoRetry,
    darkMode,
    availableModels,

    setCwd,
    setProvider,
    setModelId,
    setThinkingLevel,
    setAutoCompaction,
    setAutoRetry,
    toggleDarkMode,
    setAvailableModels,
    loadPersisted,
  }
})
