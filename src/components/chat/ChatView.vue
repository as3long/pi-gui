<script setup lang="ts">
import MessageList from './MessageList.vue'
import InputArea from '../input/InputArea.vue'
import ModelPicker from '../settings/ModelPicker.vue'
import StatusBar from './StatusBar.vue'
import { computed } from 'vue'
import { useChatStore } from '../../stores/chat'
import { useSessionStore } from '../../stores/session'
import { useSettingsStore } from '../../stores/settings'
import { piPrompt, piSteer, piAbort, piStart, piNewSession, piGetSessionStats, piCompactSession, piGetHomeDir, piReadDirectory } from '../../ipc/bridge'
import { watch, ref } from 'vue'
import { createLogger } from '../../utils/logger'
import { usePureMVC, NotificationNames } from '../../mvc'

const logger = createLogger('ChatView')

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()
const { facade } = usePureMVC()

let messageIdCounter = 0
const showCwdEditor = ref(false)
const cwdInput = ref(settingsStore.cwd)

// Computed cwd from session workspace or fallback to settings
const currentCwd = computed(() => {
  if (sessionStore.currentWorkspace?.path) {
    return sessionStore.currentWorkspace.path
  }
  return settingsStore.cwd
})

async function onSend(message: string) {
  logger.info('onSend called', { messageLength: message.length })
  
  // Auto-start pi if not running
  if (!sessionStore.isRunning) {
    try {
      const cwd = currentCwd.value || 'C:\\Users\\huoying\\code'
      logger.info(`Starting pi with cwd: ${cwd}`)
      logger.startMeasure('pi-start-on-send')
      await piStart(cwd)
      logger.endMeasure('pi-start-on-send', 3000)
      sessionStore.isRunning = true
    } catch (e) {
      logger.error('Failed to start pi:', e)
      return
    }
  }

  // If current session is temp, create real session on backend first
  if (chatStore.isCurrentSessionTemp) {
    logger.info('Creating real session for temp chat...')
    try {
      await piNewSession()
      // Wait for session file to be written
      await new Promise(resolve => setTimeout(resolve, 500))
      // Find the newest session
      const homeDir = await piGetHomeDir()
      if (homeDir) {
        const sessionDir = `${homeDir}/.pi/agent/sessions`
        const sessionFiles = await piReadDirectory(sessionDir, 2)
        let newestId = ''
        let newestPath = ''
        if (Array.isArray(sessionFiles)) {
          for (const projectDir of sessionFiles) {
            if (projectDir.type === 'directory' && projectDir.children) {
              for (const sessionFile of projectDir.children) {
                if (sessionFile.name?.endsWith('.jsonl')) {
                  const parts = sessionFile.name.replace('.jsonl', '').split('_')
                  const sid = parts[1] || ''
                  if (sid > newestId) {
                    newestId = sid
                    newestPath = sessionFile.path
                  }
                }
              }
            }
          }
        }
        if (newestId) {
          chatStore.replaceTempSession(newestId)
          sessionStore.currentSessionId = newestId
          sessionStore.currentSessionFile = newestPath
          logger.info('Real session created:', newestId)
        }
      }
      facade.sendNotification(NotificationNames.SESSION_CREATED)
    } catch (e) {
      logger.error('Failed to create session:', e)
    }
  }

  const id = `msg-${++messageIdCounter}`
  logger.info(`Sending message with id: ${id}`)

  // Add user message to chat immediately
  chatStore.addMessage({
    role: 'user',
    content: message,
    timestamp: Date.now(),
  })
  logger.debug('User message added to chat')

  try {
    if (chatStore.isStreaming) {
      // Queue as steer during streaming
      logger.debug('Sending as steer')
      logger.startMeasure('pi-steer')
      await piSteer(id, message)
      logger.endMeasure('pi-steer', 2000)
    } else {
      logger.debug('Sending as prompt')
      logger.startMeasure('pi-prompt')
      await piPrompt(id, message)
      logger.endMeasure('pi-prompt', 5000) // Warn if takes longer than 5s
    }
    logger.info('Message sent successfully')
    // Refresh stats after sending
    setTimeout(() => piGetSessionStats(), 500)
  } catch (e) {
    logger.error('Failed to send message:', e)
  }
}

async function onAbort() {
  await piAbort()
}

async function onNewSession() {
  logger.info('Creating new chat...')
  chatStore.createNewChat()
  sessionStore.currentSessionId = null
  sessionStore.currentSessionFile = null
  sessionStore.sessionName = 'New Chat'
  logger.info('New chat created')
}

async function onRefreshStats() {
  logger.startMeasure('refresh-stats')
  await piGetSessionStats()
  logger.endMeasure('refresh-stats')
}

async function onCompact() {
  const snapshot = sessionStore.currentSessionSnapshot
  if (!snapshot) {
    console.warn('[ChatView] No active session to compact')
    return
  }
  try {
    await piCompactSession(snapshot.ref)
  } catch (e) {
    console.error('[ChatView] Failed to compact session:', e)
  }
}

function saveCwd() {
  settingsStore.setCwd(cwdInput.value)
  showCwdEditor.value = false
}

// Periodically refresh stats while streaming
let statsInterval: ReturnType<typeof setInterval> | null = null
watch(() => chatStore.isStreaming, (streaming) => {
  if (streaming) {
    statsInterval = setInterval(() => piGetSessionStats(), 3000)
  } else {
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
    }
    // Final refresh when streaming ends
    piGetSessionStats()
  }
})
</script>

<template>
  <div class="chat-view">
    <!-- Header -->
    <div class="chat-header">
      <div class="model-info">
        <ModelPicker />
        <span v-if="chatStore.isStreaming" class="status-badge streaming">Streaming…</span>
        <span v-if="chatStore.isCompacting" class="status-badge compacting">Compacting…</span>
        <span v-if="chatStore.isRetrying" class="status-badge retrying">Retrying…</span>
      </div>
      <div class="session-info">
        <span v-if="sessionStore.sessionName" class="session-name">
          {{ sessionStore.sessionName }}
        </span>
        <span class="cwd-display" @click="showCwdEditor = !showCwdEditor" title="Click to edit working directory">
          📂 {{ currentCwd || 'Not set' }}
        </span>
      </div>
    </div>

    <!-- CWD Editor -->
    <div v-if="showCwdEditor" class="cwd-editor">
      <div class="cwd-editor-row">
        <input
          v-model="cwdInput"
          class="cwd-input"
          placeholder="e.g., C:\Users\huoying\code\my-project"
          @keydown.enter="saveCwd"
        />
        <button class="btn btn-primary" @click="saveCwd">Save</button>
        <button class="btn btn-secondary" @click="showCwdEditor = false">Cancel</button>
      </div>
    </div>

    <!-- Status Bar (TUI style) -->
    <StatusBar />

    <!-- Toolbar -->
    <div class="toolbar">
      <button class="toolbar-btn" @click="onNewSession" title="New Session">
        <span class="toolbar-icon">✨</span>
        <span class="toolbar-label">New</span>
      </button>
      <button class="toolbar-btn" @click="onRefreshStats" title="Refresh Stats">
        <span class="toolbar-icon">📊</span>
        <span class="toolbar-label">Stats</span>
      </button>
      <button class="toolbar-btn" @click="chatStore.clearMessages()" title="Clear Chat">
        <span class="toolbar-icon">🗑️</span>
        <span class="toolbar-label">Clear</span>
      </button>
      <button class="toolbar-btn" @click="onCompact" title="Compact Session" :disabled="chatStore.isCompacting">
        <span class="toolbar-icon">📦</span>
        <span class="toolbar-label">{{ chatStore.isCompacting ? 'Compacting…' : 'Compact' }}</span>
      </button>
    </div>

    <!-- Error Banner -->
    <div v-if="sessionStore.lastError" class="error-banner">
      {{ sessionStore.lastError }}
      <button class="error-close" @click="sessionStore.clearError()">✕</button>
    </div>

    <!-- Messages -->
    <div class="messages-area">
      <!-- Loading overlay -->
      <div v-if="sessionStore.isLoadingSession" class="loading-overlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading session...</div>
      </div>
      <MessageList />
    </div>

    <!-- Input -->
    <div class="input-area-wrapper">
      <InputArea
        :disabled="chatStore.isCompacting"
        @send="onSend"
        @abort="onAbort"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
  font-size: 0.85em;
  flex-shrink: 0;
}

.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85em;
  animation: pulse 1.5s ease-in-out infinite;
}

.status-badge.streaming {
  background: var(--success-bg);
  color: var(--success-color);
}

.status-badge.compacting {
  background: var(--warning-bg);
  color: var(--warning-color);
}

.status-badge.retrying {
  background: var(--error-bg);
  color: var(--error-color);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.session-info {
  display: flex;
  gap: 12px;
  color: var(--muted-color);
}

.session-name {
  font-weight: 500;
}

.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--error-bg);
  color: var(--error-color);
  font-size: 0.85em;
  flex-shrink: 0;
}

.error-close {
  background: none;
  border: none;
  color: var(--error-color);
  cursor: pointer;
  font-size: 1em;
  padding: 2px 6px;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--muted-color);
  cursor: pointer;
  font-size: 0.8em;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
  border-color: var(--accent-color);
}

.toolbar-icon {
  font-size: 1em;
}

.toolbar-label {
  font-weight: 500;
}

/* CWD Editor */
.cwd-editor {
  padding: 8px 12px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
}

.cwd-editor-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.cwd-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color);
  color: var(--text-color);
  font-family: 'SF Mono', monospace;
  font-size: 0.85em;
}

.cwd-input:focus {
  border-color: var(--accent-color);
  outline: none;
}

.btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.15s;
}

.btn-primary {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: transparent;
  color: var(--muted-color);
}

.btn-secondary:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.cwd-display {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cwd-display:hover {
  background: var(--hover-bg);
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.input-area-wrapper {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-color);
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  margin-top: 12px;
  color: var(--muted-color);
  font-size: 0.9em;
}
</style>
