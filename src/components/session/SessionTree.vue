<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSessionStore } from '../../stores/session'
import { useChatStore } from '../../stores/chat'
import { ask } from '@tauri-apps/plugin-dialog'
import { piNewSession, piSwitchSession, piFork, piReadSession, piReadDirectory, piGetHomeDir, piDeleteFile, piGetSessionStats } from '../../ipc/bridge'

const sessionStore = useSessionStore()
const chatStore = useChatStore()

// Helper functions for display
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    // Convert to Beijing time (UTC+8)
    const bj = new Date(date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60000)
    const m = bj.getMonth() + 1
    const d = bj.getDate()
    const hh = String(bj.getHours()).padStart(2, '0')
    const mm = String(bj.getMinutes()).padStart(2, '0')
    return `${m}/${d} ${hh}:${mm}`
  } catch {
    return dateStr
  }
}

function shortenPath(path: string): string {
  if (!path) return ''
  // Convert Windows path format to readable
  const readable = path.replace(/--/g, ':\\').replace(/-/g, '/')
  // Show last 2 parts of path
  const parts = readable.split('/').filter(Boolean)
  if (parts.length <= 3) return readable
  return '...' + parts.slice(-3).join('/')
}

const isLoading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')

// Drag and drop state
const draggedItem = ref<string | null>(null)
const dragOverItem = ref<string | null>(null)

// Local tag storage (would normally be in store or backend)
const sessionTags = ref<Record<string, { name: string; color: string }>>({})

function getSessionTag(sessionId: string) {
  return sessionTags.value[sessionId] || null
}

// Drag and drop handlers
function onDragStart(sessionId: string) {
  draggedItem.value = sessionId
}

function onDragOver(sessionId: string, event: DragEvent) {
  event.preventDefault()
  dragOverItem.value = sessionId
}

function onDragLeave() {
  dragOverItem.value = null
}

function onDrop(_sessionId: string) {
  // Reorder would be handled by backend in real implementation
  // For now, just visual feedback
  draggedItem.value = null
  dragOverItem.value = null
}

function onDragEnd() {
  draggedItem.value = null
  dragOverItem.value = null
}

const filteredSessions = computed(() => {
  if (!searchQuery.value) return sessionStore.sessions
  const query = searchQuery.value.toLowerCase()
  return sessionStore.sessions.filter(s => 
    (s.name || s.id).toLowerCase().includes(query) ||
    s.id.toLowerCase().includes(query)
  )
})

interface SessionMetadata {
  sessionId: string
  timestamp: string
  cwd: string
  name?: string
  model?: string
  provider?: string
  messageCount: number
}

async function readSessionMetadata(filePath: string): Promise<SessionMetadata | null> {
  try {
    // Read the session file using piReadSession which returns parsed content
    const sessionData = await piReadSession(filePath)
    if (!sessionData) {
      console.log('[SessionTree] No session data returned for:', filePath)
      return null
    }
    
    // Handle both formats: array of messages (JSONL) or object with messages array
    const messages = Array.isArray(sessionData) ? sessionData : (sessionData.messages || [])
    
    if (messages.length === 0) {
      console.log('[SessionTree] No messages found in:', filePath)
      return null
    }

    // Find first message to get timestamp
    const firstMsg = messages[0]
    const firstMsgContent = firstMsg.message || firstMsg
    const timestamp = firstMsgContent.timestamp || firstMsg.timestamp || ''
    
    // Find first user message as session name
    const firstUserMsg = messages.find((m: any) => {
      const msg = m.message || m
      return msg.role === 'user'
    })
    
    let name: string | undefined
    if (firstUserMsg) {
      const msg = firstUserMsg.message || firstUserMsg
      const content = msg.content
      const text = Array.isArray(content)
        ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')
        : typeof content === 'string' ? content : ''
      name = text.trim().replace(/\n+/g, ' ').slice(0, 80) || undefined
      console.log('[SessionTree] Session name:', name)
    } else {
      console.log('[SessionTree] No user message found in:', filePath)
    }

    // Get model and provider from last assistant message
    let model: string | undefined
    let provider: string | undefined
    
    // Reverse search to find the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i].message || messages[i]
      if (msg.role === 'assistant') {
        model = msg.model || msg.responseModel
        provider = msg.provider
        break
      }
    }

    // Count user and assistant messages
    let messageCount = 0
    for (const m of messages) {
      const msg = m.message || m
      if (msg.role === 'user' || msg.role === 'assistant') {
        messageCount++
      }
    }

    console.log('[SessionTree] Message count:', messageCount, 'Model:', model)

    // Parse session ID from file path
    const pathParts = filePath.split(/[/\\]/)
    const fileName = pathParts[pathParts.length - 1] || ''
    const sessionId = fileName.replace('.jsonl', '').split('_')[1] || fileName

    return {
      sessionId,
      timestamp,
      cwd: '', // cwd is stored in directory name, not in messages
      name,
      model,
      provider,
      messageCount
    }
  } catch (e) {
    console.error('[SessionTree] Failed to read session metadata:', filePath, e)
    return null
  }
}

let isLoadingSessions = false

async function loadSessions() {
  // Prevent concurrent loading
  if (isLoadingSessions) return
  isLoadingSessions = true
  
  isLoading.value = true
  error.value = null
  
  try {
    // Clear existing sessions first to avoid duplicates
    sessionStore.sessions = []
    
    // Scan pi's session directory directly
    const homeDir = await piGetHomeDir().catch(() => '')
    if (homeDir) {
      const sessionDir = `${homeDir}/.pi/agent/sessions`
      const sessionFiles = await piReadDirectory(sessionDir, 2).catch(() => [])
      
      // Add discovered sessions to the list
      if (Array.isArray(sessionFiles)) {
        for (const projectDir of sessionFiles) {
          if (projectDir.type === 'directory' && projectDir.children) {
            for (const sessionFile of projectDir.children) {
              if (sessionFile.name?.endsWith('.jsonl')) {
                // Parse session file name: timestamp_sessionId.jsonl
                const nameParts = sessionFile.name.replace('.jsonl', '').split('_')
                const timestamp = nameParts[0] || ''
                const sessionId = nameParts[1] || sessionFile.name
                
                // Normalize filename timestamp: 2026-06-25T04-13-35-582Z → 2026-06-25T04:13:35.582Z
                const normalizedTs = timestamp.replace(
                  /(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/,
                  '$1:$2:$3.$4Z'
                )
                
                // Read metadata from the session file with timeout
                const metadataPromise = readSessionMetadata(sessionFile.path)
                const timeoutPromise = new Promise<null>((resolve) => 
                  setTimeout(() => resolve(null), 2000)
                )
                const metadata = await Promise.race([metadataPromise, timeoutPromise])
                
                // Format project path for display
                const projectPath = projectDir.name?.replace(/--/g, ':\\').replace(/-/g, '/') || ''
                
                sessionStore.sessions.push({
                  id: sessionId,
                  path: sessionFile.path,
                  name: metadata?.name || projectPath || sessionId,
                  cwd: metadata?.cwd || projectPath || '',
                  createdAt: metadata?.timestamp || normalizedTs,
                  messageCount: metadata?.messageCount || 0,
                  provider: metadata?.provider,
                  model: metadata?.model,
                } as any)
              }
            }
          }
        }
        
        // Sort sessions by time (newest first)
        sessionStore.sessions.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      }
    }
  } catch (e) {
    console.error('[SessionTree] loadSessions error:', e)
    error.value = String(e)
  } finally {
    isLoading.value = false
    isLoadingSessions = false
  }
}

async function createNewSession() {
  await piNewSession()
  chatStore.clearMessages()
}

async function switchToSession(path: string) {
  // Find the session object by path
  const session = sessionStore.sessions.find(s => s.path === path)
  if (session) {
    await openSession(session)
  }
}

async function openSession(session: any) {
  if (!session.path) return
  try {
    // Switch backend session first
    await piSwitchSession(session.path)
    
    const data = await piReadSession(session.path)
    chatStore.clearMessages()
    
    // Handle both formats: array of messages (JSONL) or object with messages array
    const messages = Array.isArray(data) ? data : (data?.messages || [])
    
    if (messages.length > 0) {
      for (const msg of messages) {
        // Extract actual message content from JSONL format
        const actualMsg = msg.message || msg
        chatStore.addMessage(actualMsg)
      }
    }
    // Update current session in store
    sessionStore.currentSessionId = session.id
    sessionStore.currentSessionFile = session.path
    sessionStore.sessionName = session.name || null
    await piGetSessionStats()
    setTimeout(() => piGetSessionStats(), 500)
  } catch (e) {
    console.warn('[SessionTree] Failed to open session:', e)
  }
}

async function forkSession(entryId: string) {
  await piFork(entryId)
  chatStore.clearMessages()
}

async function deleteSession(session: any, event: Event) {
  // Stop event propagation immediately
  event.stopPropagation()
  event.preventDefault()
  
  const sessionName = session.name || session.id.slice(0, 30) + '...'
  const messageCount = session.messageCount || 0
  
  try {
    // Use Tauri 2 dialog API with ask()
    const confirmed = await ask(
      `${messageCount} 条消息\n\n此操作不可撤销，确定要删除吗？`,
      {
        title: `⚠️ 确认删除 "${sessionName}"`,
        kind: 'warning',
        okLabel: '删除',
        cancelLabel: '取消'
      }
    )
    
    if (!confirmed) return
    
    await piDeleteFile(session.path)
    // Remove from local list
    const idx = sessionStore.sessions.findIndex(s => s.id === session.id)
    if (idx !== -1) {
      sessionStore.sessions.splice(idx, 1)
    }
  } catch (e) {
    console.error('[SessionTree] Failed to delete session:', e)
    // Fallback to window.confirm
    const confirmed = window.confirm(
      `⚠️ 确认删除 Session\n\n"${sessionName}"\n${messageCount} 条消息\n\n此操作不可撤销，确定要删除吗？`
    )
    if (confirmed) {
      await piDeleteFile(session.path)
      const idx = sessionStore.sessions.findIndex(s => s.id === session.id)
      if (idx !== -1) {
        sessionStore.sessions.splice(idx, 1)
      }
    }
  }
}

onMounted(() => {
  loadSessions()
  // Load tags from localStorage
  try {
    const savedTags = localStorage.getItem('sessionTags')
    if (savedTags) sessionTags.value = JSON.parse(savedTags)
  } catch {}
})
</script>

<template>
  <div class="session-tree">
    <div class="session-tree-header">
      <h3 class="session-tree-title">Sessions</h3>
      <button class="btn-icon" @click="createNewSession" title="New Session">
        ✨
      </button>
    </div>

    <!-- Search and Actions -->
    <div class="search-wrapper">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="Search sessions..."
      />
    </div>

    <div v-if="isLoading" class="session-tree-loading">
      Loading sessions...
    </div>

    <div v-else-if="error" class="session-tree-error">
      <span>{{ error }}</span>
      <button class="btn-icon" @click="loadSessions">🔄</button>
    </div>

    <div v-else-if="filteredSessions.length === 0" class="session-tree-empty">
      {{ searchQuery ? 'No matching sessions' : 'No sessions found' }}
    </div>

    <div v-else class="session-tree-list">
      <div
        v-for="session in filteredSessions"
        :key="session.id"
        class="session-tree-item"
        :class="{
          active: session.id === sessionStore.currentSessionId,
          'drag-over': dragOverItem === session.id,
          dragging: draggedItem === session.id
        }"
        draggable="true"
        @click="switchToSession(session.path)"
        @dblclick="openSession(session)"
        @dragstart="onDragStart(session.id)"
        @dragover="onDragOver(session.id, $event)"
        @dragleave="onDragLeave"
        @drop="onDrop(session.id)"
        @dragend="onDragEnd"
      >
        <div class="drag-handle">⋮⋮</div>
        <div class="session-body">
          <div class="session-name">{{ session.name || session.id }}</div>
          <div class="session-time">{{ formatDate(session.createdAt) }}</div>
          <div class="session-row-meta">
            <span v-if="session.cwd" class="session-cwd" :title="session.cwd">📁 {{ shortenPath(session.cwd) }}</span>
            <span v-if="(session as any).model" class="session-model">{{ (session as any).model }}</span>
            <span v-if="session.messageCount" class="session-msgs">{{ session.messageCount }} msgs</span>
          </div>
        </div>
        <!-- Tags -->
        <div v-if="getSessionTag(session.id)" class="session-tag" :class="getSessionTag(session.id)?.color">
          {{ getSessionTag(session.id)?.name }}
        </div>
        <!-- Actions -->
        <div class="session-actions">
          <button
            class="btn-session-action btn-fork"
            title="Fork Session"
            @click.stop="forkSession(session.id)"
          >
            🍴
          </button>
          <button
            class="btn-session-action btn-delete"
            title="Delete Session"
            @click="deleteSession(session, $event)"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
  border-right: 1px solid var(--border-color);
}

.session-tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
}

.session-tree-title {
  margin: 0;
  font-size: 0.95em;
  font-weight: 600;
  color: var(--text-color);
}

.btn-icon {
  background: none;
  border: none;
  font-size: 1.1em;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.btn-icon:hover {
  background: var(--hover-bg);
}

.session-tree-loading,
.session-tree-error,
.session-tree-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--muted-color);
  font-size: 0.85em;
  text-align: center;
}

.session-tree-error {
  color: var(--error-color);
  gap: 8px;
}

.session-tree-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-tree-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
  margin-bottom: 2px;
}

.session-tree-item:hover {
  background: var(--hover-bg);
}

.session-tree-item.active {
  background: var(--badge-bg);
  border-color: var(--accent-color);
}

.session-body {
  flex: 1;
  min-width: 0;
}

.session-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-time {
  font-size: 11px;
  color: var(--muted-color);
  line-height: 1.4;
  margin-top: 1px;
}

.session-row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted-color);
  line-height: 1.3;
  margin-top: 2px;
}

.session-cwd {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.7;
}

.session-model {
  flex-shrink: 0;
  color: var(--accent-color);
  opacity: 0.85;
  white-space: nowrap;
}

.session-msgs {
  flex-shrink: 0;
  white-space: nowrap;
  opacity: 0.6;
}

.search-wrapper {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent-color);
}

.btn-session-action {
  background: none;
  border: none;
  border-radius: 4px;
  padding: 3px 5px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1;
}

.btn-session-action:hover {
  background: var(--hover-bg);
}

.btn-delete:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.btn-fork:hover {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

/* Drag and Drop */
.drag-handle {
  cursor: grab;
  color: var(--muted-color);
  font-size: 10px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  margin-top: 2px;
  line-height: 1;
}

.session-tree-item:hover .drag-handle {
  opacity: 0.5;
}

.drag-handle:active {
  cursor: grabbing;
}

.session-tree-item.dragging {
  opacity: 0.4;
}

.session-tree-item.drag-over {
  border-top: 2px solid var(--accent-color);
}

/* Tags */
.session-tag {
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.tag-blue {
  background: var(--info-bg);
  color: var(--accent-color);
}

.tag-green {
  background: var(--success-bg);
  color: var(--success-color);
}

.tag-purple {
  background: rgba(128, 0, 128, 0.1);
  color: #c084fc;
}

.tag-orange {
  background: rgba(255, 165, 0, 0.1);
  color: #f59e0b;
}

.tag-pink {
  background: rgba(255, 105, 180, 0.1);
  color: #ec4899;
}

/* Actions */
.session-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.session-tree-item:hover .session-actions {
  opacity: 1;
}

.btn-action {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-action:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
}

/* Search Actions */
.search-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.search-actions .btn-action {
  opacity: 0.7;
}

.search-actions .btn-action:hover {
  opacity: 1;
}
</style>
