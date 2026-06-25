import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
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
    if (event.type === 'response') {
      // Support both camelCase and snake_case field names
      const data = (event as any).data as any
      
      // Check if this is a stats response
      const cmd = (event as any).command
      if (cmd === 'get_session_stats' && data) {
        stats.value = data as SessionStats
        console.log('[SessionStore] Updated stats:', stats.value)
      } else if (data && 'tokens' in data && 'totalMessages' in data) {
        stats.value = data as SessionStats
        console.log('[SessionStore] Updated stats (shape match):', stats.value)
      }
      
      // Handle UI state response
      if (data && 'sessionId' in data) {
        currentSessionId.value = data.sessionId
        currentSessionFile.value = data.sessionFile || (data as any).sessionFile
        sessionName.value = data.sessionName || (data as any).sessionName
        if (data.model) {
          currentModel.value = data.model
        }
        thinkingLevel.value = (data.thinkingLevel || (data as any).thinking_level) as ThinkingLevel
        steeringMode.value = (data.steeringMode || (data as any).steering_mode) as QueueMode
        followUpMode.value = (data.followUpMode || (data as any).follow_up_mode) as QueueMode

        // Update session status based on streaming state
        if (data.isStreaming) {
          sessionStatus.value = 'running'
        } else if (data.isCompacting) {
          sessionStatus.value = 'running'
        } else {
          sessionStatus.value = 'idle'
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
