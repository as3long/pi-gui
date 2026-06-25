<script setup lang="ts">
import MessageList from './MessageList.vue'
import InputArea from '../input/InputArea.vue'
import ModelPicker from '../settings/ModelPicker.vue'
import StatusBar from './StatusBar.vue'
import { useChatStore } from '../../stores/chat'
import { useSessionStore } from '../../stores/session'
import { useSettingsStore } from '../../stores/settings'
import { piPrompt, piSteer, piAbort, piStart, piNewSession, piGetSessionStats, piCompactSession } from '../../ipc/bridge'
import { watch } from 'vue'

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()

let messageIdCounter = 0

async function onSend(message: string) {
  console.log('[PiGUI] onSend called with:', message)
  
  // Auto-start pi if not running
  if (!sessionStore.isRunning) {
    try {
      const cwd = settingsStore.cwd || 'C:\\Users\\huoying\\code'
      console.log('[PiGUI] Starting pi with cwd:', cwd)
      await piStart(cwd)
      sessionStore.isRunning = true
    } catch (e) {
      console.error('[PiGUI] Failed to start pi:', e)
      return
    }
  }

  const id = `msg-${++messageIdCounter}`
  console.log('[PiGUI] Sending message with id:', id)

  // Add user message to chat immediately
  chatStore.addMessage({
    role: 'user',
    content: message,
    timestamp: Date.now(),
  })
  console.log('[PiGUI] User message added to chat')

  try {
    if (chatStore.isStreaming) {
      // Queue as steer during streaming
      console.log('[PiGUI] Sending as steer')
      await piSteer(id, message)
    } else {
      console.log('[PiGUI] Sending as prompt')
      await piPrompt(id, message)
    }
    console.log('[PiGUI] Message sent successfully')
    // Refresh stats after sending
    setTimeout(() => piGetSessionStats(), 500)
  } catch (e) {
    console.error('[PiGUI] Failed to send message:', e)
  }
}

async function onAbort() {
  await piAbort()
}

async function onNewSession() {
  await piNewSession()
  chatStore.clearMessages()
}

async function onRefreshStats() {
  await piGetSessionStats()
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

.messages-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.input-area-wrapper {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
}
</style>
