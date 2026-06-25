<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from './stores/settings'
import { useSessionStore } from './stores/session'
import ChatView from './components/chat/ChatView.vue'
import SettingsPanel from './components/settings/SettingsPanel.vue'
import ExtensionDialog from './components/extension/ExtensionDialog.vue'
import SessionTree from './components/session/SessionTree.vue'
import { FileTree } from './components/files'
import { startEventListeners, clearEventHandlers, piNewSession, piCycleModel, piStart, piGetState } from './ipc/bridge'

const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()

const showSettings = ref(false)
const showSessions = ref(false)
const showFiles = ref(false)
let cleanupEvents: (() => void) | null = null

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  // Ctrl/Cmd + N: New Session
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault()
    piNewSession()
  }
  // Ctrl/Cmd + /: Toggle Sessions panel
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault()
    showSessions.value = !showSessions.value
  }
  // Ctrl/Cmd + B: Toggle Files panel
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault()
    showFiles.value = !showFiles.value
  }
  // Ctrl/Cmd + ,: Open Settings
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault()
    showSettings.value = !showSettings.value
  }
  // Ctrl/Cmd + K: Cycle Model
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    piCycleModel()
  }
  // Escape: Close Settings
  if (e.key === 'Escape') {
    if (showSettings.value) showSettings.value = false
    if (showSessions.value) showSessions.value = false
    if (showFiles.value) showFiles.value = false
  }
}

onMounted(async () => {
  // Load persisted settings
  settingsStore.loadPersisted()

  // Set CSS class for dark mode
  updateTheme()

  // Start event listeners
  cleanupEvents = await startEventListeners()

  // Register keyboard shortcuts
  document.addEventListener('keydown', handleKeydown)

  // Auto-start pi process
  try {
    const cwd = settingsStore.cwd || 'C:\\Users\\huoying\\code'
    await piStart(cwd)
    sessionStore.isRunning = true
    console.log('[PiGUI] Pi process started successfully')
    
    // Get initial state
    await piGetState()
  } catch (e) {
    console.error('[PiGUI] Failed to auto-start pi:', e)
    // Don't show error to user, they can start manually
  }
})

onUnmounted(() => {
  if (cleanupEvents) {
    cleanupEvents()
  }
  clearEventHandlers()
  document.removeEventListener('keydown', handleKeydown)
})

function updateTheme() {
  document.documentElement.setAttribute(
    'data-theme',
    settingsStore.darkMode ? 'dark' : 'light'
  )
}

// Watch for dark mode changes
import { watch } from 'vue'
watch(() => settingsStore.darkMode, updateTheme)

// File handlers
function handleFileSelect(file: any) {
  console.log('Selected file:', file)
}

function handleFileOpen(file: any) {
  console.log('Opened file:', file)
}

// Reconnect handler
async function handleReconnect() {
  if (sessionStore.isRunning) return
  
  try {
    const cwd = settingsStore.cwd || 'C:\\Users\\huoying\\code'
    await piStart(cwd)
    sessionStore.isRunning = true
    await piGetState()
    console.log('[PiGUI] Reconnected to pi')
  } catch (e) {
    console.error('[PiGUI] Failed to reconnect:', e)
  }
}
</script>

<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1 class="app-title">Pi</h1>
      </div>

      <nav class="sidebar-nav">
        <button class="nav-btn" :class="{ active: !showSettings && !showSessions && !showFiles }" @click="showSettings = false; showSessions = false; showFiles = false">
          <span class="nav-icon">💬</span>
          <span class="nav-label">Chat</span>
        </button>
        <button class="nav-btn" :class="{ active: showSessions }" @click="showSessions = !showSessions">
          <span class="nav-icon">📋</span>
          <span class="nav-label">Sessions</span>
        </button>
        <button class="nav-btn" :class="{ active: showFiles }" @click="showFiles = !showFiles">
          <span class="nav-icon">📁</span>
          <span class="nav-label">Files</span>
        </button>
        <button class="nav-btn" :class="{ active: showSettings }" @click="showSettings = !showSettings">
          <span class="nav-icon">⚙️</span>
          <span class="nav-label">Settings</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="status-indicator" :class="{ running: sessionStore.isRunning }" @click="handleReconnect">
          <span class="status-dot"></span>
          <span class="status-text">{{ sessionStore.isRunning ? 'Connected' : 'Offline (Click to connect)' }}</span>
        </div>
      </div>
    </aside>

    <!-- Session Tree Panel -->
    <aside v-if="showSessions" class="session-panel">
      <SessionTree @close="showSessions = false" />
    </aside>

    <!-- File Tree Panel -->
    <aside v-if="showFiles" class="file-panel">
      <FileTree
        :files="[]"
        root-name="Project"
        @select="handleFileSelect"
        @open="handleFileOpen"
      />
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <ChatView v-if="!showSettings" />
      <SettingsPanel v-else @close="showSettings = false" />
    </main>
    <!-- Extension UI Dialogs (modal) -->
    <ExtensionDialog />
  </div>
</template>

<style>
/* ── CSS Variables (Theme) ── */
:root,
[data-theme="dark"] {
  --bg-color: #1a1a2e;
  --header-bg: #16213e;
  --input-bg: #0f3460;
  --sidebar-bg: #0f3460;
  --text-color: #e0e0e0;
  --muted-color: #8892b0;
  --border-color: #2a3a5c;
  --accent-color: #64ffda;
  --accent-glow: rgba(100, 255, 218, 0.15);
  --hover-bg: rgba(255, 255, 255, 0.05);

  --user-bg: #1a3a5c;
  --user-border: #2a5a8c;
  --assistant-bg: #1e2a3e;
  --badge-bg: rgba(100, 255, 218, 0.1);
  --code-bg: #0d1b2a;
  --thinking-bg: #1a1a2e;
  --tool-bg: #1e2a3e;
  --tool-header-bg: #16213e;

  --success-bg: rgba(100, 255, 218, 0.1);
  --success-color: #64ffda;
  --warning-bg: rgba(255, 213, 79, 0.1);
  --warning-color: #ffd54f;
  --error-bg: rgba(255, 107, 107, 0.1);
  --error-color: #ff6b6b;
  --info-bg: rgba(100, 149, 237, 0.1);

  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-color);
  background: var(--bg-color);
}

[data-theme="light"] {
  --bg-color: #ffffff;
  --header-bg: #f8f9fa;
  --input-bg: #f0f2f5;
  --sidebar-bg: #f0f2f5;
  --text-color: #1a1a2e;
  --muted-color: #6c757d;
  --border-color: #dee2e6;
  --accent-color: #0d6efd;
  --accent-glow: rgba(13, 110, 253, 0.15);
  --hover-bg: rgba(0, 0, 0, 0.03);

  --user-bg: #cfe2ff;
  --user-border: #9ec5fe;
  --assistant-bg: #f8f9fa;
  --badge-bg: rgba(13, 110, 253, 0.08);
  --code-bg: #f4f4f4;
  --thinking-bg: #f0f2f5;
  --tool-bg: #f8f9fa;
  --tool-header-bg: #e9ecef;

  --success-bg: rgba(25, 135, 84, 0.1);
  --success-color: #198754;
  --warning-bg: rgba(255, 193, 7, 0.1);
  --warning-color: #ffc107;
  --error-bg: rgba(220, 53, 69, 0.1);
  --error-color: #dc3545;
  --info-bg: rgba(13, 110, 253, 0.08);
}

/* ── Global Reset ── */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--muted-color);
}
</style>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

/* ── Sidebar ── */
.sidebar {
  width: 60px;
  display: flex;
  flex-direction: column;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sidebar-header {
  padding: 16px 0;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
}

.app-title {
  font-size: 1.4em;
  font-weight: 700;
  color: var(--accent-color);
  letter-spacing: -0.05em;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 48px;
  padding: 8px 4px;
  border: none;
  background: transparent;
  color: var(--muted-color);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;
}

.nav-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.nav-btn.active {
  background: var(--badge-bg);
  color: var(--accent-color);
}

.nav-icon {
  font-size: 1.2em;
}

.nav-label {
  font-size: 0.65em;
  font-weight: 500;
}

.sidebar-footer {
  padding: 12px 0;
  text-align: center;
  border-top: 1px solid var(--border-color);
}

.status-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.status-indicator:hover {
  background: var(--hover-bg);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted-color);
}

.status-indicator.running .status-dot {
  background: var(--success-color);
  box-shadow: 0 0 6px var(--success-color);
}

.status-text {
  font-size: 0.6em;
  color: var(--muted-color);
}

/* ── Session Panel ── */
.session-panel {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  background: var(--bg-color);
}

/* ── File Panel ── */
.file-panel {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  background: var(--bg-color);
}

/* ── Main Content ── */
.main-content {
  flex: 1;
  overflow: hidden;
}
</style>
