<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSessionStore } from '../../stores/session'
import { useChatStore } from '../../stores/chat'
import { ask } from '@tauri-apps/plugin-dialog'
import { piSwitchSession, piFork, piReadSession, piReadSessionMetadata, piReadDirectory, piGetHomeDir, piDeleteFile, piGetSessionStats } from '../../ipc/bridge'
import WorkspaceSelector from '../workspace/WorkspaceSelector.vue'
import SessionItem from './SessionItem.vue'
import { createLogger } from '../../utils/logger'
import { usePureMVC, SessionMediator } from '../../mvc'

const logger = createLogger('SessionTree')
const {} = usePureMVC()

// Temporarily using Pinia for session list (complex migration deferred)
const sessionStore = useSessionStore()
const chatStore = useChatStore()

const isLoading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')

// Drag and drop state
const draggedItem = ref<string | null>(null)
const dragOverItem = ref<string | null>(null)

// Local tag storage
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

async function readSessionMetadata(filePath: string): Promise<any | null> {
  try {
    // Use the fast metadata reader (only reads first 20 lines)
    const sessionData = await piReadSessionMetadata(filePath, 20)
    if (!sessionData) return null

    const allLines = Array.isArray(sessionData) ? sessionData : (sessionData.messages || [])
    
    // Filter to only message type entries
    const messages = allLines.filter((m: any) => m.type === 'message')

    if (messages.length === 0) {
      const pathParts = filePath.split(/[/\\]/)
      const fileName = pathParts[pathParts.length - 1] || ''
      const nameParts = fileName.replace('.jsonl', '').split('_')
      const timestamp = nameParts[0] || ''
      const sessionId = nameParts[1] || fileName
      const normalizedTs = timestamp.replace(
        /(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/,
        '$1:$2:$3.$4Z'
      )
      return {
        sessionId,
        timestamp: normalizedTs,
        cwd: '',
        name: 'New Session (Empty)',
        model: undefined,
        provider: undefined,
        messageCount: 0
      }
    }

    // Only process first and last messages for metadata
    const firstMsg = messages[0]
    const firstMsgContent = firstMsg.message || firstMsg
    const timestamp = firstMsgContent.timestamp || firstMsg.timestamp || ''

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
    }

    let model: string | undefined
    let provider: string | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i].message || messages[i]
      if (msg.role === 'assistant') {
        model = msg.model || msg.responseModel
        provider = msg.provider
        break
      }
    }

    let messageCount = 0
    for (const m of messages) {
      const msg = m.message || m
      if (msg.role === 'user' || msg.role === 'assistant') {
        messageCount++
      }
    }

    const pathParts = filePath.split(/[/\\]/)
    const fileName = pathParts[pathParts.length - 1] || ''
    const sessionId = fileName.replace('.jsonl', '').split('_')[1] || fileName

    return {
      sessionId,
      timestamp,
      cwd: '',
      name,
      model,
      provider,
      messageCount
    }
  } catch (e) {
    return null
  }
}

let isLoadingSessions = false
const MAX_SESSIONS_TO_LOAD = 50

async function loadSessions() {
  if (isLoadingSessions) return
  isLoadingSessions = true

  logger.info('Loading sessions...')
  isLoading.value = true
  error.value = null

  try {
    const homeDir = await piGetHomeDir().catch(() => '')
    if (!homeDir) return

    const sessionDir = `${homeDir}/.pi/agent/sessions`
    const sessionFiles = await piReadDirectory(sessionDir, 2).catch(() => [])

    const allSessions: any[] = []

    if (Array.isArray(sessionFiles)) {
      for (const projectDir of sessionFiles) {
        if (projectDir.type === 'directory' && projectDir.children) {
          for (const sessionFile of projectDir.children) {
            if (sessionFile.name?.endsWith('.jsonl')) {
              const nameParts = sessionFile.name.replace('.jsonl', '').split('_')
              const timestamp = nameParts[0] || ''
              const sessionId = nameParts[1] || sessionFile.name
              const normalizedTs = timestamp.replace(
                /(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/,
                '$1:$2:$3.$4Z'
              )
              const projectPath = projectDir.name?.replace(/--/g, ':\\').replace(/-/g, '/') || ''

              allSessions.push({
                id: sessionId,
                path: sessionFile.path,
                name: sessionId,
                cwd: projectPath || '',
                createdAt: normalizedTs,
                messageCount: 0,
                provider: undefined,
                model: undefined,
              })
            }
          }
        }
      }
    }

    allSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const sessionsToProcess = allSessions.slice(0, MAX_SESSIONS_TO_LOAD)
    sessionStore.sessions = sessionsToProcess

    // Load metadata in background (non-blocking, batch update)
    const loadMetadataBatch = async () => {
      const batchSize = 10
      for (let i = 0; i < sessionsToProcess.length; i += batchSize) {
        const batch = sessionsToProcess.slice(i, i + batchSize)
        const promises = batch.map(async (session) => {
          try {
            const metadata = await Promise.race([
              readSessionMetadata(session.path),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 500))
            ])
            if (metadata) {
              const idx = sessionsToProcess.findIndex(s => s.id === session.id)
              if (idx !== -1) {
                sessionsToProcess[idx] = {
                  ...sessionsToProcess[idx],
                  name: metadata.name || sessionsToProcess[idx].name,
                  messageCount: metadata.messageCount || 0,
                  provider: metadata.provider,
                  model: metadata.model,
                  createdAt: metadata.timestamp || sessionsToProcess[idx].createdAt,
                }
              }
            }
          } catch (e) { /* ignore */ }
        })
        await Promise.all(promises)
        // Single batch update instead of per-session updates
        sessionStore.sessions = [...sessionsToProcess]
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    loadMetadataBatch().catch(() => {})

  } catch (e) {
    logger.error('loadSessions error:', e)
    error.value = String(e)
  } finally {
    isLoading.value = false
    isLoadingSessions = false
  }
}

async function createNewSession() {
  // Just create a temp chat in memory - no backend call
  chatStore.createNewChat()
  sessionStore.currentSessionId = null
  sessionStore.currentSessionFile = null
  sessionStore.sessionName = 'New Chat'
}

async function openSession(session: any) {
  if (!session.path) return
  try {
    sessionStore.isLoadingSession = true
    
    // Check if we already have messages for this session in memory
    const hasCachedMessages = chatStore.hasSessionMessages(session.id)
    
    // Always switch backend session
    await piSwitchSession(session.path)
    
    if (!hasCachedMessages) {
      // Only load from file if not cached
      logger.info('Loading messages from file for session:', session.id)
      const data = await piReadSession(session.path)
      
      // Batch load messages into chat store
      const rawMessages = Array.isArray(data) ? data : (data?.messages || [])
      const messages = rawMessages
        .filter((m: any) => m.type === 'message')
        .map((m: any) => m.message || m)
        .filter((m: any) => m && m.role)
      
      chatStore.loadSessionMessages(session.id, messages)
    } else {
      // Just switch to cached session
      logger.info('Using cached messages for session:', session.id)
      chatStore.setSession(session.id)
    }
    
    sessionStore.currentSessionId = session.id
    sessionStore.currentSessionFile = session.path
    sessionStore.sessionName = session.name || null
    await piGetSessionStats()
    setTimeout(() => piGetSessionStats(), 500)
  } catch (e) {
    logger.error('Failed to open session:', e)
  } finally {
    sessionStore.isLoadingSession = false
  }
}

async function switchToSession(path: string) {
  const session = sessionStore.sessions.find(s => s.path === path)
  if (session) {
    await openSession(session)
  }
}

async function forkSession(entryId: string) {
  await piFork(entryId)
  chatStore.clearMessages()
}

async function deleteSession(session: any, event: Event) {
  event.stopPropagation()
  event.preventDefault()

  const sessionName = session.name || session.id.slice(0, 30) + '...'
  const messageCount = session.messageCount || 0

  try {
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
    sessionStore.sessions = sessionStore.sessions.filter(s => s.id !== session.id)
  } catch (e) {
    logger.error('Failed to delete session:', e)
    const confirmed = window.confirm(
      `⚠️ 确认删除 Session\n\n"${sessionName}"\n${messageCount} 条消息\n\n此操作不可撤销，确定要删除吗？`
    )
    if (confirmed) {
      await piDeleteFile(session.path)
      sessionStore.sessions = sessionStore.sessions.filter(s => s.id !== session.id)
    }
  }
}

onMounted(() => {
  // Load session list only (no message preloading on startup)
  loadSessions()
  try {
    const savedTags = localStorage.getItem('sessionTags')
    if (savedTags) sessionTags.value = JSON.parse(savedTags)
  } catch {}
  // Listen for session created notifications via PureMVC
  SessionMediator.addSessionCreatedListener(() => {
    logger.info('Received SESSION_CREATED notification, reloading sessions')
    loadSessions()
  })
  logger.info('SessionTree mounted')
})
</script>

<template>
  <div class="session-tree">
    <div class="session-tree-header">
      <h3 class="session-tree-title">Sessions</h3>
      <button class="btn-icon" @click="createNewSession" title="New Session">✨</button>
    </div>

    <div class="workspace-wrapper">
      <WorkspaceSelector />
    </div>

    <div class="search-wrapper">
      <input v-model="searchQuery" class="search-input" placeholder="Search sessions..." />
    </div>

    <div v-if="isLoading" class="session-tree-loading">Loading sessions...</div>

    <div v-else-if="error" class="session-tree-error">
      <span>{{ error }}</span>
      <button class="btn-icon" @click="() => loadSessions()">🔄</button>
    </div>

    <div v-else-if="filteredSessions.length === 0" class="session-tree-empty">
      {{ searchQuery ? 'No matching sessions' : 'No sessions found' }}
    </div>

    <div v-else class="session-tree-list">
      <SessionItem
        v-for="session in filteredSessions"
        :key="session.id"
        :session="session"
        :is-active="session.id === sessionStore.currentSessionId"
        :is-drag-over="dragOverItem === session.id"
        :is-dragging="draggedItem === session.id"
        :tag="getSessionTag(session.id)"
        @click="switchToSession(session.path)"
        @dblclick="openSession(session)"
        @fork="forkSession(session.id)"
        @delete="(...args: any[]) => deleteSession(session, args[1])"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @dragend="onDragEnd"
      />
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

.workspace-wrapper {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
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
</style>
