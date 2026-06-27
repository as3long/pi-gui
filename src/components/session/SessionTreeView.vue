<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useSessionStore } from '../../stores/session'
import { piGetSessionTree, piNavigateSessionTree } from '../../ipc/bridge'
import type { SessionTreeNodeSnapshot, SessionRef } from '../../ipc/types'

const sessionStore = useSessionStore()

const isLoading = ref(false)
const error = ref<string | null>(null)

// Get current session ref
const currentSessionRef = computed<SessionRef | null>(() => {
  if (!sessionStore.currentSessionId || !sessionStore.currentWorkspace) {
    return null
  }
  return {
    workspaceId: sessionStore.currentWorkspace.workspaceId,
    sessionId: sessionStore.currentSessionId,
  }
})

// Get session tree from store
const sessionTree = computed(() => sessionStore.sessionTree)
const currentTreeNodeId = computed(() => sessionStore.currentTreeNodeId)

// Flatten tree for display
const flatTree = computed(() => {
  if (!sessionTree.value) return []

  const result: Array<{
    node: SessionTreeNodeSnapshot
    depth: number
    isLast: boolean
  }> = []

  function traverse(
    nodes: readonly SessionTreeNodeSnapshot[],
    depth: number,
    _isLast: boolean
  ) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const nodeIsLast = i === nodes.length - 1
      result.push({ node, depth, isLast: nodeIsLast })
      if (node.children.length > 0) {
        traverse(node.children, depth + 1, nodeIsLast)
      }
    }
  }

  traverse(sessionTree.value.roots, 0, true)
  return result
})

// Get node icon based on kind
function getNodeIcon(kind: string, role?: string): string {
  switch (kind) {
    case 'message':
      return role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '💬'
    case 'thinking_level_change':
      return '🧠'
    case 'model_change':
      return '🔄'
    case 'compaction':
      return '📦'
    case 'branch_summary':
      return '📋'
    case 'label':
      return '🏷️'
    case 'session_info':
      return 'ℹ️'
    default:
      return '•'
  }
}

// Get node class based on kind
function getNodeClass(kind: string): string {
  switch (kind) {
    case 'message':
      return 'node-message'
    case 'thinking_level_change':
    case 'model_change':
      return 'node-change'
    case 'compaction':
      return 'node-compaction'
    default:
      return 'node-default'
  }
}

// Format timestamp
function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return timestamp
    const bj = new Date(date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60000)
    return `${String(bj.getHours()).padStart(2, '0')}:${String(bj.getMinutes()).padStart(2, '0')}`
  } catch {
    return timestamp
  }
}

// Handle node click
async function handleNodeClick(node: SessionTreeNodeSnapshot) {
  if (!currentSessionRef.value) return

  sessionStore.setCurrentTreeNode(node.id)

  // Navigate to this node in the backend
  try {
    await piNavigateSessionTree(currentSessionRef.value, node.id)
  } catch (e) {
    console.warn('[SessionTreeView] Failed to navigate:', e)
  }
}

// Load session tree
async function loadSessionTree() {
  if (!currentSessionRef.value) return

  isLoading.value = true
  error.value = null

  try {
    const tree = await piGetSessionTree(currentSessionRef.value)
    sessionStore.setSessionTree(tree)

    // Set current node to leaf if exists
    if (tree.leafId) {
      sessionStore.setCurrentTreeNode(tree.leafId)
    }
  } catch (e) {
    console.error('[SessionTreeView] Failed to load tree:', e)
    error.value = String(e)
  } finally {
    isLoading.value = false
  }
}

// Watch for session changes
watch(
  () => sessionStore.currentSessionId,
  () => {
    if (sessionStore.currentSessionId) {
      loadSessionTree()
    }
  }
)

// Load on mount if session is active
onMounted(() => {
  if (sessionStore.currentSessionId) {
    loadSessionTree()
  }
})
</script>

<template>
  <div class="session-tree-view">
    <div class="tree-header">
      <h3 class="tree-title">Message Tree</h3>
      <button class="btn-icon" @click="loadSessionTree" title="Refresh">🔄</button>
    </div>

    <div v-if="isLoading" class="tree-loading">Loading...</div>

    <div v-else-if="error" class="tree-error">
      <span>{{ error }}</span>
      <button class="btn-icon" @click="loadSessionTree">🔄</button>
    </div>

    <div v-else-if="flatTree.length === 0" class="tree-empty">
      No messages in this session
    </div>

    <div v-else class="tree-content">
      <div
        v-for="item in flatTree"
        :key="item.node.id"
        class="tree-node"
        :class="[
          getNodeClass(item.node.kind),
          { active: item.node.id === currentTreeNodeId }
        ]"
        :style="{ paddingLeft: `${12 + item.depth * 16}px` }"
        @click="handleNodeClick(item.node)"
      >
        <span class="node-icon">{{ getNodeIcon(item.node.kind, item.node.role) }}</span>
        <div class="node-content">
          <div class="node-title">{{ item.node.title }}</div>
          <div v-if="item.node.preview" class="node-preview">
            {{ item.node.preview.slice(0, 60) }}{{ item.node.preview.length > 60 ? '...' : '' }}
          </div>
        </div>
        <span v-if="item.node.timestamp" class="node-time">
          {{ formatTime(item.node.timestamp) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-tree-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
  border-left: 1px solid var(--border-color);
}

.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
}

.tree-title {
  margin: 0;
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-color);
}

.btn-icon {
  background: none;
  border: none;
  font-size: 1em;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}

.btn-icon:hover {
  background: var(--hover-bg);
}

.tree-loading,
.tree-error,
.tree-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--muted-color);
  font-size: 0.85em;
  text-align: center;
}

.tree-error {
  color: var(--error-color);
  gap: 8px;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.tree-node {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
  border-left: 2px solid transparent;
}

.tree-node:hover {
  background: var(--hover-bg);
}

.tree-node.active {
  background: var(--badge-bg);
  border-left-color: var(--accent-color);
}

.tree-node.node-message {
  font-size: 13px;
}

.tree-node.node-change {
  font-size: 12px;
  opacity: 0.8;
}

.tree-node.node-compaction {
  font-size: 12px;
  opacity: 0.7;
  font-style: italic;
}

.node-icon {
  flex-shrink: 0;
  font-size: 14px;
  margin-top: 2px;
}

.node-content {
  flex: 1;
  min-width: 0;
}

.node-title {
  font-weight: 500;
  color: var(--text-color);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-preview {
  font-size: 11px;
  color: var(--muted-color);
  line-height: 1.3;
  margin-top: 2px;
}

.node-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted-color);
  opacity: 0.7;
}
</style>
