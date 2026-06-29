import { defineStore } from 'pinia'
import { shallowRef, ref, computed, watch } from 'vue'
import { useSettingsStore } from './settings'
import { piGetSessionStats, piGetHomeDir } from '../ipc/bridge'
import { invoke } from '@tauri-apps/api/core'
import type {
  SessionInfo,
  SessionStats,
  ModelInfo,
  ThinkingLevel,
  QueueMode,
  RpcEvent,
  SessionSnapshot,
  SessionStatus,
  WorkspaceRef,
  SessionTreeSnapshot,
  SessionTreeNodeSnapshot,
} from '../ipc/types'

/**
 * Session store manages pi session lifecycle, workspace, and UI state.
 */
export const useSessionStore = defineStore('session', () => {
  // ── Workspace State ──
  const workspaces = ref<WorkspaceRef[]>([])
  const currentWorkspace = ref<WorkspaceRef | null>(null)

  // ── Session State ──
  // Use shallowRef for large lists to reduce reactivity overhead
  const sessions = shallowRef<SessionInfo[]>([])
  const sessionSnapshots = shallowRef<Map<string, SessionSnapshot>>(new Map())
  const currentSessionId = ref<string | null>(null)
  const currentSessionFile = ref<string | null>(null)
  const sessionName = ref<string | null>(null)
  const stats = ref<SessionStats | null>(null)

  // ── Session Status ──
  const sessionStatus = ref<SessionStatus>('idle')
  const runningRunId = ref<string | null>(null)
  const isLoadingSession = ref(false)

  // ── Watchers ──
  // Prevent persist during initial load
  let isRestoring = false

  // Persist session when it changes
  watch([currentSessionId, currentSessionFile, sessionName], () => {
    if (!isRestoring) persistState()
  })

  // ── Session Tree ──
  const sessionTree = ref<SessionTreeSnapshot | null>(null)
  const currentTreeNodeId = ref<string | null>(null)

  // ── UI State ──
  const isRunning = ref(false)
  const currentModel = ref<ModelInfo | null>(null)
  const thinkingLevel = ref<ThinkingLevel>('medium')
  const steeringMode = ref<QueueMode>('one-at-a-time')
  const followUpMode = ref<QueueMode>('one-at-a-time')

  // ── Error / info messages ──
  const lastError = ref<string | null>(null)
  
  // ── Watchdog State ──
  const isInactive = ref(false) // True when agent has been inactive for >60s during running
  const inactiveSeconds = ref(0) // Seconds of inactivity

  // ── Persistence ──
  const STORAGE_KEY_WORKSPACE = 'pi-gui:currentWorkspace'
  const STORAGE_KEY_SESSION = 'pi-gui:currentSession'

  // ── Computed ──

  const currentSessionSnapshot = computed(() => {
    if (!currentSessionId.value) return null
    return sessionSnapshots.value.get(currentSessionId.value) || null
  })

  const currentWorkspaceSessions = computed(() => {
    if (!currentWorkspace.value) return sessions.value
    return sessions.value.filter(s => {
      // Simple path-based matching for now
      return s.cwd === currentWorkspace.value?.path
    })
  })

  const archivedSessions = computed(() => {
    return sessions.value.filter(s => {
      const snapshot = sessionSnapshots.value.get(s.id)
      return snapshot?.archivedAt != null
    })
  })

  const activeSessions = computed(() => {
    return sessions.value.filter(s => {
      const snapshot = sessionSnapshots.value.get(s.id)
      return snapshot?.archivedAt == null
    })
  })

  // ── Actions ──


  // -- Disk persistence (~/.pi-gui/last-session.json) --
  const SESSION_FILE = 'last-session.json'

  async function saveSessionToDisk() {
    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      const home = await piGetHomeDir()
      const dirPath = home + '\\.pi-gui'
      const filePath = dirPath + '\\' + SESSION_FILE
      await invoke('create_dir_all', { path: dirPath })
      const data = {
        sessionId: currentSessionId.value,
        sessionFile: currentSessionFile.value,
        sessionName: sessionName.value,
        workspace: currentWorkspace.value,
        savedAt: new Date().toISOString(),
      }
      await writeTextFile(filePath, JSON.stringify(data, null, 2))

    } catch (e) {
      console.warn('[SessionStore] Failed to save to disk:', e)
    }
  }

  async function loadSessionFromDisk() {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const home = await piGetHomeDir()
      const filePath = home + '\\.pi-gui\\' + SESSION_FILE
      const content = await readTextFile(filePath)
      const parsed = JSON.parse(content)

      return parsed
    } catch (e: any) {

      return null
    }
  }

  async function loadPersisted() {

    isRestoring = true
    try {
      // Try loading from disk first (~/.pi-gui/last-session.json)
  
      const diskData = await loadSessionFromDisk()
  
      if (diskData) {
        if (diskData.workspace) currentWorkspace.value = diskData.workspace
        if (diskData.sessionId) {
          currentSessionId.value = diskData.sessionId
          currentSessionFile.value = diskData.sessionFile || null
          sessionName.value = diskData.sessionName || null
        }
          return
      }
      // Fallback to localStorage
      try {
        const savedWorkspace = localStorage.getItem(STORAGE_KEY_WORKSPACE)
        if (savedWorkspace) {
          currentWorkspace.value = JSON.parse(savedWorkspace)
        }
        const savedSession = localStorage.getItem(STORAGE_KEY_SESSION)
        if (savedSession) {
          const data = JSON.parse(savedSession)
          currentSessionId.value = data.sessionId
          currentSessionFile.value = data.sessionFile
          sessionName.value = data.sessionName
        }
      } catch (e) {
        console.warn('[SessionStore] Failed to load persisted state:', e)
      }
    } finally {
        isRestoring = false
    }
  }

  function persistState() {
    // Also persist to disk (fire and forget)
    saveSessionToDisk()
    try {
      if (currentWorkspace.value) {
        localStorage.setItem(STORAGE_KEY_WORKSPACE, JSON.stringify(currentWorkspace.value))
      } else {
        localStorage.removeItem(STORAGE_KEY_WORKSPACE)
      }
      if (currentSessionId.value) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({
          sessionId: currentSessionId.value,
          sessionFile: currentSessionFile.value,
          sessionName: sessionName.value,
        }))
      } else {
        localStorage.removeItem(STORAGE_KEY_SESSION)
      }
    } catch (e) {
      console.warn('[SessionStore] Failed to persist state:', e)
    }
  }

  function handleEvent(event: RpcEvent) {
    if (event.type === 'response') {
      // Support both camelCase and snake_case field names
      const response = event as any
      const data = response.data
      const cmd = response.command
      

      
      // Check if this is a stats response
      if ((cmd === 'get_session_stats' || cmd === 'session_stats') && data) {

        
        // Data from pi is already in camelCase format, just assign it directly
        // but provide fallbacks for all fields
        stats.value = {
          sessionFile: data.sessionFile ?? data.session_file,
          sessionId: data.sessionId ?? data.session_id ?? '',
          userMessages: data.userMessages ?? data.user_messages ?? 0,
          assistantMessages: data.assistantMessages ?? data.assistant_messages ?? 0,
          toolCalls: data.toolCalls ?? data.tool_calls ?? 0,
          toolResults: data.toolResults ?? data.tool_results ?? 0,
          totalMessages: data.totalMessages ?? data.total_messages ?? 0,
          tokens: {
            input: data.tokens?.input ?? 0,
            output: data.tokens?.output ?? 0,
            cacheRead: data.tokens?.cacheRead ?? data.tokens?.cache_read ?? 0,
            cacheWrite: data.tokens?.cacheWrite ?? data.tokens?.cache_write ?? 0,
            total: data.tokens?.total ?? 0,
          },
          cost: data.cost ?? 0,
          contextUsage: {
            tokens: data.contextUsage?.tokens ?? 0,
            contextWindow: data.contextUsage?.contextWindow ?? data.contextUsage?.context_window ?? 0,
            percent: data.contextUsage?.percent ?? 0,
          },
        }
        



      }

      // Handle available models response
      if (cmd === 'get_available_models' && Array.isArray(data)) {
        // Note: This is handled via direct invoke now, not via RPC response
        // Keep this for backward compatibility
        const settingsStore = useSettingsStore()
        const models = data.map((m: any) => ({
          id: m.id || m.modelId || m.model_id || '',
          name: m.name || m.id || m.modelId || m.model_id || '',
          provider: m.provider || '',
          reasoning: m.reasoning || false,
        }))
        settingsStore.setAvailableModels(models)

      }
      
      // Handle set_model response - update current model
      if (cmd === 'set_model' && data) {

        if (data.model) {
          currentModel.value = data.model

        } else if (data.provider && data.modelId) {
          // Construct model info from provider and modelId
          currentModel.value = {
            id: data.modelId,
            name: data.modelId,
            provider: data.provider,
            api: '',
            baseUrl: '',
            reasoning: false,
            contextWindow: 0,
            maxTokens: 0,
          }

        } else {
          // Fallback: use settings store values
          const settingsStore = useSettingsStore()
          if (settingsStore.provider && settingsStore.modelId) {
            currentModel.value = {
              id: settingsStore.modelId,
              name: settingsStore.modelId,
              provider: settingsStore.provider,
              api: '',
              baseUrl: '',
              reasoning: false,
              contextWindow: 0,
              maxTokens: 0,
            }
  
          }
        }
      }

      // Handle UI state response - also check for stats embedded in state response
      if (data) {
        // Always update model if present in response
        if (data.model) {
          currentModel.value = data.model

        }
        
        if ('sessionId' in data || 'session_id' in data) {
          // Only set from response if not already restored from disk
          if (!currentSessionId.value) {
            currentSessionId.value = data.sessionId || data.session_id
            currentSessionFile.value = data.sessionFile || data.session_file
            sessionName.value = data.sessionName || data.session_name
          }
          thinkingLevel.value = (data.thinkingLevel || data.thinking_level) as ThinkingLevel
          steeringMode.value = (data.steeringMode || data.steering_mode) as QueueMode
          followUpMode.value = (data.followUpMode || data.follow_up_mode) as QueueMode

          // Update session status based on streaming state
          if (data.isStreaming || data.is_streaming) {
            sessionStatus.value = 'running'
          } else if (data.isCompacting || data.is_compacting) {
            sessionStatus.value = 'running'
          } else {
            sessionStatus.value = 'idle'
          }
        }

        // Also extract stats from state response if present
        if ((cmd === 'get_state' || !cmd) && ('stats' in data || 'stats' in (data.state || {}))) {
          const statsData = data.stats || data.state?.stats
          if (statsData && !stats.value) {

            stats.value = {
              sessionFile: statsData.sessionFile ?? statsData.session_file,
              sessionId: statsData.sessionId ?? statsData.session_id ?? '',
              userMessages: statsData.userMessages ?? statsData.user_messages ?? 0,
              assistantMessages: statsData.assistantMessages ?? statsData.assistant_messages ?? 0,
              toolCalls: statsData.toolCalls ?? statsData.tool_calls ?? 0,
              toolResults: statsData.toolResults ?? statsData.tool_results ?? 0,
              totalMessages: statsData.totalMessages ?? statsData.total_messages ?? 0,
              tokens: {
                input: statsData.tokens?.input ?? 0,
                output: statsData.tokens?.output ?? 0,
                cacheRead: statsData.tokens?.cacheRead ?? statsData.tokens?.cache_read ?? 0,
                cacheWrite: statsData.tokens?.cacheWrite ?? statsData.tokens?.cache_write ?? 0,
                total: statsData.tokens?.total ?? 0,
              },
              cost: statsData.cost ?? 0,
              contextUsage: {
                tokens: statsData.contextUsage?.tokens ?? 0,
                contextWindow: statsData.contextUsage?.contextWindow ?? statsData.contextUsage?.context_window ?? 0,
                percent: statsData.contextUsage?.percent ?? 0,
              },
            }

          }
        }
      }
    }

    if (event.type === 'response' && !event.success) {
      lastError.value = (event as any).error || (event as any).errorMessage || 'Unknown error'
      sessionStatus.value = 'failed'
    }

    // Update session status based on agent events
    if (event.type === 'agent_start') {
      sessionStatus.value = 'running'
      startAgentWatchdog()
    }

    if (event.type === 'agent_end') {
      sessionStatus.value = 'idle'
      stopAgentWatchdog()
      // Refresh stats after agent completes
      scheduleStatsRefresh(500)
    }

    // Reset watchdog on any activity during running state
    if (sessionStatus.value === 'running') {
      resetAgentWatchdog()
    }
  }

  function setSessions(list: SessionInfo[]) {
    sessions.value = list
  }

  function addSession(session: SessionInfo) {
    const existing = sessions.value.find(s => s.id === session.id)
    if (!existing) {
      sessions.value = [...sessions.value, session]
    }
  }

  function updateSessionSnapshot(snapshot: SessionSnapshot) {
    const newSnapshots = new Map(sessionSnapshots.value)
    newSnapshots.set(snapshot.ref.sessionId, snapshot)
    sessionSnapshots.value = newSnapshots
  }

  function setStats(s: SessionStats) {
    stats.value = s
  }

  function clearError() {
    lastError.value = null
  }

  // ── Stats Refresh ──
  let statsRefreshInterval: ReturnType<typeof setInterval> | null = null
  let statsRefreshTimeout: ReturnType<typeof setTimeout> | null = null
  
  // ── Agent Watchdog - prevent UI hang during long tool execution
  let agentWatchdogTimer: ReturnType<typeof setInterval> | null = null
  let agentLastActivity = Date.now()

  // Reset watchdog when agent activity is detected
  function resetAgentWatchdog() {
    agentLastActivity = Date.now()
    isInactive.value = false
    inactiveSeconds.value = 0
  }

  // Start watchdog when agent starts - check every 5 seconds for activity
  function startAgentWatchdog() {
    resetAgentWatchdog()
    if (agentWatchdogTimer) {
      clearInterval(agentWatchdogTimer)
    }
    agentWatchdogTimer = setInterval(() => {
      if (sessionStatus.value !== 'running') return
      
      const inactiveTime = (Date.now() - agentLastActivity) / 1000
      inactiveSeconds.value = Math.round(inactiveTime)
      
      if (inactiveTime > 60) {
        isInactive.value = true
        console.warn(`[SessionStore] Agent inactive for ${inactiveSeconds.value}s - consider aborting`)
      }
    }, 5000) // Check every 5 seconds
  }

  // Stop watchdog
  function stopAgentWatchdog() {
    if (agentWatchdogTimer) {
      clearInterval(agentWatchdogTimer)
      agentWatchdogTimer = null
    }
    isInactive.value = false
    inactiveSeconds.value = 0
  }

  /**
   * Refresh stats from the backend.
   * Used on startup and after agent runs complete.
   */
  async function refreshStats() {
    try {
      await piGetSessionStats()
    } catch (e) {
      console.warn('[SessionStore] refreshStats failed:', e)
    }
  }

  /**
   * Start periodic stats refresh (every 10 seconds when idle).
   */
  function startStatsRefresh() {
    if (statsRefreshInterval) return
    statsRefreshInterval = setInterval(() => {
      if (sessionStatus.value === 'idle') {
        refreshStats()
      }
    }, 10_000)
  }

  /**
   * Stop periodic stats refresh.
   */
  function stopStatsRefresh() {
    if (statsRefreshInterval) {
      clearInterval(statsRefreshInterval)
      statsRefreshInterval = null
    }
    if (statsRefreshTimeout) {
      clearTimeout(statsRefreshTimeout)
      statsRefreshTimeout = null
    }
  }

  /**
   * Schedule a stats refresh after a delay (e.g., after agent_end).
   * Debounces so rapid events don't flood with requests.
   */
  function scheduleStatsRefresh(delayMs = 1000) {
    if (statsRefreshTimeout) clearTimeout(statsRefreshTimeout)
    statsRefreshTimeout = setTimeout(() => {
      refreshStats()
    }, delayMs)
  }

  // ── Workspace Actions ──

  function setWorkspaces(list: WorkspaceRef[]) {
    workspaces.value = list
  }

  function addWorkspace(workspace: WorkspaceRef) {
    const existing = workspaces.value.find(w => w.workspaceId === workspace.workspaceId)
    if (!existing) {
      workspaces.value.push(workspace)
    }
  }

  function setCurrentWorkspace(workspace: WorkspaceRef | null) {
    currentWorkspace.value = workspace
    persistState()
  }

  // ── Session Tree Actions ──

  function setSessionTree(tree: SessionTreeSnapshot) {
    sessionTree.value = tree
  }

  function setCurrentTreeNode(nodeId: string | null) {
    currentTreeNodeId.value = nodeId
  }

  function findTreeNode(nodeId: string): SessionTreeNodeSnapshot | null {
    if (!sessionTree.value) return null
    
    function search(nodes: readonly SessionTreeNodeSnapshot[]): SessionTreeNodeSnapshot | null {
      for (const node of nodes) {
        if (node.id === nodeId) return node
        const found = search(node.children)
        if (found) return found
      }
      return null
    }

    return search(sessionTree.value.roots)
  }

  function getNodePath(nodeId: string): SessionTreeNodeSnapshot[] {
    if (!sessionTree.value) return []
    
    function findPath(nodes: readonly SessionTreeNodeSnapshot[], target: string, path: SessionTreeNodeSnapshot[]): SessionTreeNodeSnapshot[] | null {
      for (const node of nodes) {
        if (node.id === target) return [...path, node]
        const result = findPath(node.children, target, [...path, node])
        if (result) return result
      }
      return null
    }

    return findPath(sessionTree.value.roots, nodeId, []) || []
  }

  return {
    // Workspace State
    workspaces,
    currentWorkspace,

    // Session State
    sessions,
    sessionSnapshots,
    currentSessionId,
    currentSessionFile,
    sessionName,
    stats,

    // Session Status
    sessionStatus,
    runningRunId,
    isLoadingSession,

    // Session Tree
    sessionTree,
    currentTreeNodeId,

    // UI State
    isRunning,
    currentModel,
    thinkingLevel,
    steeringMode,
    followUpMode,
    lastError,
    
    // Watchdog State
    isInactive,
    inactiveSeconds,

    // Computed
    currentSessionSnapshot,
    currentWorkspaceSessions,
    archivedSessions,
    activeSessions,

    // Actions
    loadPersisted,
    handleEvent,
    setSessions,
    addSession,
    updateSessionSnapshot,
    setStats,
    clearError,
    refreshStats,
    startStatsRefresh,
    stopStatsRefresh,
    scheduleStatsRefresh,
    resetAgentWatchdog,
    stopAgentWatchdog,

    // Workspace Actions
    setWorkspaces,
    addWorkspace,
    setCurrentWorkspace,

    // Session Tree Actions
    setSessionTree,
    setCurrentTreeNode,
    findTreeNode,
    getNodePath,
  }
})
