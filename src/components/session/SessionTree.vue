<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSessionStore } from '../../stores/session'
import { useChatStore } from '../../stores/chat'
import { piListSessions, piNewSession, piSwitchSession, piFork } from '../../ipc/bridge'

const sessionStore = useSessionStore()
const chatStore = useChatStore()

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

function setSessionTag(sessionId: string, name: string, color: string) {
  sessionTags.value[sessionId] = { name, color }
  // Persist to localStorage
  localStorage.setItem('sessionTags', JSON.stringify(sessionTags.value))
}

// Export sessions
function exportSessions() {
  const data = {
    sessions: sessionStore.sessions,
    tags: sessionTags.value,
    exportedAt: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pi-sessions-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Import sessions
const fileInput = ref<HTMLInputElement | null>(null)

function importSessions() {
  fileInput.value?.click()
}

function handleFileImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string)
      if (data.tags) {
        sessionTags.value = { ...sessionTags.value, ...data.tags }
        localStorage.setItem('sessionTags', JSON.stringify(sessionTags.value))
      }
      // Note: sessions would need backend support for actual import
      alert('Tags imported successfully!')
    } catch (err) {
      alert('Failed to import: Invalid JSON')
    }
  }
  reader.readAsText(file)
  input.value = ''
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

async function loadSessions() {
  isLoading.value = true
  error.value = null
  try {
    await piListSessions()
  } catch (e) {
    error.value = String(e)
  } finally {
    isLoading.value = false
  }
}

async function createNewSession() {
  await piNewSession()
  chatStore.clearMessages()
}

async function switchToSession(path: string) {
  await piSwitchSession(path)
  chatStore.clearMessages()
}

async function forkSession(entryId: string) {
  await piFork(entryId)
  chatStore.clearMessages()
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
      <div class="search-actions">
        <button class="btn-action" @click="exportSessions" title="Export">
          📤
        </button>
        <button class="btn-action" @click="importSessions" title="Import">
          📥
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleFileImport"
        />
      </div>
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
        @dragstart="onDragStart(session.id)"
        @dragover="onDragOver(session.id, $event)"
        @dragleave="onDragLeave"
        @drop="onDrop(session.id)"
        @dragend="onDragEnd"
      >
        <div class="drag-handle">⋮⋮</div>
        <div class="session-icon">📋</div>
        <div class="session-details">
          <div class="session-name">{{ session.name || session.id }}</div>
          <div class="session-meta">
            <span>{{ session.messageCount }} messages</span>
            <span>·</span>
            <span>{{ new Date(session.createdAt).toLocaleDateString() }}</span>
          </div>
        </div>
        <!-- Tags -->
        <div v-if="getSessionTag(session.id)" class="session-tag" :class="getSessionTag(session.id)?.color">
          {{ getSessionTag(session.id)?.name }}
        </div>
        <!-- Actions -->
        <div class="session-actions">
          <button
            class="btn-action"
            title="Add Tag"
            @click.stop="setSessionTag(session.id, 'Important', 'tag-blue')"
          >
            🏷️
          </button>
          <button
            class="btn-fork"
            title="Fork Session"
            @click.stop="forkSession(session.id)"
          >
            🍴
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
  padding: 12px 16px;
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.session-tree-item:hover {
  background: var(--hover-bg);
}

.session-tree-item.active {
  background: var(--badge-bg);
  border: 1px solid var(--accent-color);
}

.session-icon {
  font-size: 1.1em;
  flex-shrink: 0;
}

.session-details {
  flex: 1;
  min-width: 0;
}

.session-name {
  font-size: 0.85em;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  display: flex;
  gap: 6px;
  font-size: 0.7em;
  color: var(--muted-color);
  margin-top: 2px;
}

.search-wrapper {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.search-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.85em;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent-color);
}

.btn-fork {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.9em;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
}

.session-tree-item:hover .btn-fork {
  opacity: 1;
}

.btn-fork:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
}

/* Drag and Drop */
.drag-handle {
  cursor: grab;
  color: var(--muted-color);
  font-size: 0.9em;
  opacity: 0;
  transition: opacity 0.15s;
}

.session-tree-item:hover .drag-handle {
  opacity: 0.6;
}

.drag-handle:active {
  cursor: grabbing;
}

.session-tree-item.dragging {
  opacity: 0.5;
}

.session-tree-item.drag-over {
  border-top: 2px solid var(--accent-color);
}

/* Tags */
.session-tag {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.65em;
  font-weight: 500;
  white-space: nowrap;
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
  display: flex;
  gap: 4px;
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
