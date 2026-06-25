<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from './stores/settings'
import { useSessionStore } from './stores/session'
import ChatView from './components/chat/ChatView.vue'
import SettingsPanel from './components/settings/SettingsPanel.vue'
import LoginDialog from './components/settings/LoginDialog.vue'
import ExtensionDialog from './components/extension/ExtensionDialog.vue'
import SessionTree from './components/session/SessionTree.vue'
import { FileTree } from './components/files'
import { startEventListeners, clearEventHandlers, onPiEvent, piNewSession, piCycleModel, piStart, piGetState, piReadDirectory, piIsRunning, piDeleteFile, piGetAvailableModels, piGetSessionStats } from './ipc/bridge'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useChatStore } from './stores/chat'
import CodeEditor from './components/editor/CodeEditor.vue'

const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

const showSettings = ref(false)
const showLogin = ref(false)
const showSessions = ref(false)
const showFiles = ref(false)
// File tree state
const fileTreeData = ref<any[]>([])
const openFile = ref<{ path: string; name: string; content: string; language: string; modified: boolean } | null>(null)
let cleanupEvents: (() => void) | null = null

async function loadDirectory(path: string) {
  try {
    const data = await piReadDirectory(path, 3)
    fileTreeData.value = Array.isArray(data) ? data : []
  } catch (e) {
    console.error('Failed to read directory:', e)
    fileTreeData.value = []
  }
}

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
  // Ctrl/Cmd + S: Save file
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    if (openFile.value?.modified) {
      saveFile()
    }
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

  // Register event handlers for stores
  onPiEvent('*', (event) => {
    console.log('[PiGUI] Received event:', event.type)
    chatStore.handleEvent(event)
    sessionStore.handleEvent(event)
  })

  // Register keyboard shortcuts
  document.addEventListener('keydown', handleKeydown)

  // Auto-start pi process
  try {
    const cwd = settingsStore.cwd || 'C:\\Users\\huoying\\code'
    
    // Check if pi is already running
    const alreadyRunning = await piIsRunning()
    if (alreadyRunning) {
      sessionStore.isRunning = true
      console.log('[PiGUI] Pi is already running')
    } else {
      await piStart(cwd)
      sessionStore.isRunning = true
      console.log('[PiGUI] Pi process started successfully')
    }
    
    // Get initial state
    await piGetState()
    
    // Get session stats
    await piGetSessionStats()
    
    // Get available models
    try {
      const models = await piGetAvailableModels()
      settingsStore.setAvailableModels(models)
    } catch (e) {
      console.error('[PiGUI] Failed to load available models:', e)
    }
    
    // Load initial directory
    await loadDirectory(cwd)
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

async function handleFileOpen(file: any) {
  if (file.type === 'directory') {
    settingsStore.setCwd(file.path)
    await loadDirectory(file.path)
  } else {
    // Read and display file content
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const content = await readTextFile(file.path)
      // Detect language from extension
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const langMap: Record<string, string> = {
        'js': 'javascript', 'jsx': 'javascript',
        'ts': 'typescript', 'tsx': 'typescript',
        'py': 'python',
        'html': 'html', 'htm': 'html',
        'css': 'css', 'scss': 'css',
        'json': 'javascript',
        'md': 'javascript',
      }
      const language = langMap[ext] || 'javascript'
      openFile.value = { path: file.path, name: file.name, content, language, modified: false }
    } catch (e) {
      console.error('Failed to read file:', e)
      openFile.value = { path: file.path, name: file.name, content: `Error reading file: ${e}`, language: 'javascript', modified: false }
    }
  }
}

function onFileContentChange(value: string) {
  if (openFile.value) {
    openFile.value.content = value
    openFile.value.modified = true
  }
}

async function saveFile() {
  if (!openFile.value) return
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(openFile.value.path, openFile.value.content)
    openFile.value.modified = false
    console.log('[PiGUI] File saved successfully:', openFile.value.path)
  } catch (e) {
    console.error('[PiGUI] Failed to save file:', e)
    alert(`Failed to save file: ${e}`)
  }
}

async function closeFile() {
  if (openFile.value?.modified) {
    const discard = await confirm('File has unsaved changes. Discard?', { title: 'Unsaved Changes', kind: 'warning' })
    if (!discard) {
      return
    }
  }
  openFile.value = null
}

async function handleOpenFolder() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Project Folder',
    })
    if (selected) {
      const folderPath = typeof selected === 'string' ? selected : selected
      settingsStore.setCwd(folderPath)
      await loadDirectory(folderPath)
    }
  } catch (e) {
    console.error('Failed to open folder dialog:', e)
    if (settingsStore.cwd) {
      await loadDirectory(settingsStore.cwd)
    }
  }
}

// Reconnect handler
async function handleFileDelete(file: any) {
  const confirmed = await confirm(`Delete "${file.name}"?`, { title: 'Delete File', kind: 'warning' })
  if (!confirmed) return

  console.log('[PiGUI] Attempting to delete file:', file)
  console.log('[PiGUI] File path:', file.path)

  try {
    await piDeleteFile(file.path)
    // Remove the file from the local tree data
    function removeFromTree(nodes: any[]): any[] {
      return nodes.filter(n => n.path !== file.path).map(n => {
        if (n.type === 'directory' && n.children) {
          return { ...n, children: removeFromTree(n.children) }
        }
        return n
      })
    }
    fileTreeData.value = removeFromTree(fileTreeData.value)
    console.log('[PiGUI] Deleted:', file.path)
  } catch (e) {
    console.error('[PiGUI] Failed to delete file:', e)
    alert(`Failed to delete: ${e}`)
  }
}

async function handleFileRename(file: any, newName: string) {
  // TODO: implement rename via Tauri command
  console.log('[PiGUI] Rename requested:', file.path, '->', newName)
}

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
        <button class="nav-btn" :class="{ active: !showSettings && !showLogin && !showSessions && !showFiles }" @click="showSettings = false; showLogin = false; showSessions = false; showFiles = false">
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
        <button class="nav-btn" :class="{ active: showLogin }" @click="showLogin = !showLogin">
          <span class="nav-icon">🔑</span>
          <span class="nav-label">Login</span>
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
    <LoginDialog v-if="showLogin" @close="showLogin = false" />

    <!-- File Tree Panel -->
    <aside v-if="showFiles" class="file-panel">
      <FileTree
        :files="fileTreeData"
        :root-name="settingsStore.cwd ? settingsStore.cwd.split(/[\\\/]/).pop() || 'Project' : 'Project'"
        @select="handleFileSelect"
        @open="handleFileOpen"
        @delete="handleFileDelete"
        @rename="handleFileRename"
        @refresh="settingsStore.cwd ? loadDirectory(settingsStore.cwd) : undefined"
      />
      <div class="file-panel-footer">
        <button class="open-folder-btn" @click="handleOpenFolder">
          📂 Open Folder
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <!-- File viewer -->
      <div v-if="openFile" class="file-viewer">
        <div class="file-viewer-header">
          <span class="file-viewer-name">
            📄 {{ openFile.name }}
            <span v-if="openFile.modified" class="modified-indicator">●</span>
          </span>
          <span class="file-viewer-path">{{ openFile.path }}</span>
          <button class="file-viewer-btn save-btn" @click="saveFile" :disabled="!openFile.modified" title="Save (Ctrl+S)">
            💾 Save
          </button>
          <button class="file-viewer-close" @click="closeFile">✕</button>
        </div>
        <CodeEditor
          :model-value="openFile.content"
          :language="openFile.language as any"
          :theme="settingsStore.darkMode ? 'dark' : 'light'"
          :read-only="false"
          class="file-viewer-editor"
          @update:model-value="onFileContentChange"
        />
      </div>
      <ChatView v-else-if="!showSettings" />
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
  --bg-color: #1a1b1e;
  --header-bg: #202124;
  --input-bg: #2b2d31;
  --sidebar-bg: #202124;
  --text-color: #d4d4d8;
  --muted-color: #8b8d94;
  --border-color: #3a3c42;
  --accent-color: #7c6bf5;
  --accent-glow: rgba(124, 107, 245, 0.15);
  --hover-bg: rgba(255, 255, 255, 0.06);

  --user-bg: #2b2d31;
  --user-border: #4a4d55;
  --assistant-bg: #232428;
  --badge-bg: rgba(124, 107, 245, 0.1);
  --code-bg: #232428;
  --thinking-bg: #1e1f22;
  --tool-bg: #232428;
  --tool-header-bg: #202124;

  --success-bg: rgba(34, 197, 94, 0.1);
  --success-color: #22c55e;
  --warning-bg: rgba(234, 179, 8, 0.1);
  --warning-color: #eab308;
  --error-bg: rgba(239, 68, 68, 0.1);
  --error-color: #ef4444;
  --info-bg: rgba(59, 130, 246, 0.1);

  font-family:
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Text",
    "Segoe UI",
    sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-color);
  background: var(--bg-color);
}

[data-theme="light"] {
  --bg-color: #f8f8fb;
  --header-bg: #f4f5f8;
  --input-bg: #ffffff;
  --sidebar-bg: #f4f5f8;
  --text-color: #39435b;
  --muted-color: #747d93;
  --border-color: #dde1ea;
  --accent-color: #6a55f2;
  --accent-glow: rgba(106, 85, 242, 0.15);
  --hover-bg: rgba(0, 0, 0, 0.03);

  --user-bg: #ffffff;
  --user-border: #d2d7e2;
  --assistant-bg: #f1f3f7;
  --badge-bg: rgba(106, 85, 242, 0.08);
  --code-bg: #f2f4f8;
  --thinking-bg: #f1f3f7;
  --tool-bg: #f1f3f7;
  --tool-header-bg: #e8eaf0;

  --success-bg: rgba(34, 197, 94, 0.1);
  --success-color: #16a34a;
  --warning-bg: rgba(234, 179, 8, 0.1);
  --warning-color: #ca8a04;
  --error-bg: rgba(239, 68, 68, 0.1);
  --error-color: #dc2626;
  --info-bg: rgba(59, 130, 246, 0.08);
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

/* Message content styling */
.text-content p {
  margin: 0;
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
  padding: 12px 0;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
}

.app-title {
  font-size: 1.2em;
  font-weight: 700;
  color: var(--accent-color);
  letter-spacing: -0.05em;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  gap: 2px;
}

.nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 44px;
  padding: 6px 4px;
  border: none;
  background: transparent;
  color: var(--muted-color);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;
  font-size: 14px;
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
  font-size: 1.1em;
}

.nav-label {
  font-size: 0.6em;
  font-weight: 500;
}

.sidebar-footer {
  padding: 8px 0;
  text-align: center;
  border-top: 1px solid var(--border-color);
}

.status-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 6px;
  border-radius: 5px;
  transition: background 0.15s;
}

.status-indicator:hover {
  background: var(--hover-bg);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted-color);
}

.status-indicator.running .status-dot {
  background: var(--success-color);
  box-shadow: 0 0 6px var(--success-color);
}

.status-text {
  font-size: 0.55em;
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
  display: flex;
  flex-direction: column;
}

.file-panel-footer {
  padding: 6px 10px;
  border-top: 1px solid var(--border-color);
  background: var(--header-bg);
}

.open-folder-btn {
  width: 100%;
  padding: 6px 10px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--muted-color);
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.15s;
}

.open-folder-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--badge-bg);
}

/* ── Main Content ── */
.main-content {
  flex: 1;
  overflow: hidden;
}

/* ── File Viewer ── */
.file-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.file-viewer-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.file-viewer-name {
  font-weight: 600;
  color: var(--text-color);
  font-size: 0.9em;
  display: flex;
  align-items: center;
  gap: 5px;
}

.modified-indicator {
  color: var(--warning-color);
  font-size: 1.2em;
}

.file-viewer-path {
  font-size: 0.75em;
  color: var(--muted-color);
  font-family: ui-monospace, 'SF Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.file-viewer-close {
  background: none;
  border: none;
  color: var(--muted-color);
  cursor: pointer;
  font-size: 1em;
  padding: 3px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}

.file-viewer-close:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.file-viewer-btn {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--muted-color);
  cursor: pointer;
  font-size: 0.8em;
  padding: 3px 10px;
  border-radius: 5px;
  transition: all 0.15s;
}

.file-viewer-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--text-color);
  border-color: var(--accent-color);
}

.file-viewer-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.save-btn:hover:not(:disabled) {
  background: var(--success-bg);
  color: var(--success-color);
  border-color: var(--success-color);
}

.file-viewer-editor {
  flex: 1;
  overflow: hidden;
}
</style>
