import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from './settings'
import { piGetSessionStats } from '../ipc/bridge'
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
  const sessions = ref<SessionInfo[]>([])
  const sessionSnapshots = ref<Map<string, SessionSnapshot>>(new Map())
  const currentSessionId = ref<string | null>(null)
  const currentSessionFile = ref<string | null>(null)
  const sessionName = ref<string | null>(null)
  const stats = ref<SessionStats | null>(null)

  // ── Session Status ──
  const sessionStatus = ref<SessionStatus>('idle')
  const runningRunId = ref<string | null>(null)

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

  function handleEvent(event: RpcEvent) {
    console.log('[SessionStore] handleEvent called, type:', event.type)
    
    if (event.type === 'response') {
      // Support both camelCase and snake_case field names
      const response = event as any
      const data = response.data
      const cmd = response.command
      
      console.log('[SessionStore] Response event - command:', cmd, 'hasData:', !!data)
      
      // Check if this is a stats response
      if ((cmd === 'get_session_stats' || cmd === 'session_stats') && data) {
        console.log('[SessionStore] Processing stats response, raw data:', JSON.stringify(data, null, 2))
        
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
        
        console.log('[SessionStore] Updated stats.value:', stats.value)
        console.log('[SessionStore] tokens.input:', stats.value?.tokens?.input)
        console.log('[SessionStore] contextUsage.percent:', stats.value?.contextUsage?.percent)
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
        console.log('[SessionStore] Updated available models from event:', models.length)
      }
      
      // Handle set_model response - update current model
      if (cmd === 'set_model' && data) {
        if (data.model) {
          currentModel.value = data.model
          console.log('[SessionStore] Updated model from set_model response:', data.model)
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
          console.log('[SessionStore] Constructed model from set_model response:', data.provider, data.modelId)
        }
      }

      // Handle UI state response - also check for stats embedded in state response
      if (data) {
        if ('sessionId' in data || 'session_id' in data) {
          currentSessionId.value = data.sessionId || data.session_id
          currentSessionFile.value = data.sessionFile || data.session_file
          sessionName.value = data.sessionName || data.session_name
          if (data.model) {
            currentModel.value = data.model
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
            console.log('[SessionStore] Found stats in state response:', statsData)
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
            console.log('[SessionStore] Updated stats from state:', stats.value)
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
    }

    if (event.type === 'agent_end') {
      sessionStatus.value = 'idle'
      // Refresh stats after agent completes
      scheduleStatsRefresh(500)
    }
  }

  function setSessions(list: SessionInfo[]) {
    sessions.value = list
  }

  function addSession(session: SessionInfo) {
    const existing = sessions.value.find(s => s.id === session.id)
    if (!existing) {
      sessions.value.push(session)
    }
  }

  function updateSessionSnapshot(snapshot: SessionSnapshot) {
    sessionSnapshots.value.set(snapshot.ref.sessionId, snapshot)
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

    // Computed
    currentSessionSnapshot,
    currentWorkspaceSessions,
    archivedSessions,
    activeSessions,

    // Actions
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
