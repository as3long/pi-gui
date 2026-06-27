<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSessionStore } from '../../stores/session'
import { useSettingsStore } from '../../stores/settings'
import type { WorkspaceRef } from '../../ipc/types'

const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()

const isOpen = ref(false)
const searchQuery = ref('')

const currentWorkspaceDisplay = computed(() => {
  if (sessionStore.currentWorkspace) {
    return sessionStore.currentWorkspace.displayName || sessionStore.currentWorkspace.path
  }
  return 'All Workspaces'
})

const filteredWorkspaces = computed(() => {
  if (!searchQuery.value) return sessionStore.workspaces
  const query = searchQuery.value.toLowerCase()
  return sessionStore.workspaces.filter(w =>
    w.displayName?.toLowerCase().includes(query) ||
    w.path.toLowerCase().includes(query)
  )
})

function selectWorkspace(workspace: WorkspaceRef | null) {
  sessionStore.setCurrentWorkspace(workspace)
  isOpen.value = false
  searchQuery.value = ''
}

function openDropdown() {
  isOpen.value = true
}

function closeDropdown() {
  isOpen.value = false
  searchQuery.value = ''
}

// Close on click outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.workspace-selector')) {
    closeDropdown()
  }
}

// Initialize default workspace from cwd
function initializeWorkspace() {
  if (settingsStore.cwd && sessionStore.workspaces.length === 0) {
    const defaultWorkspace: WorkspaceRef = {
      workspaceId: 'default',
      path: settingsStore.cwd,
      displayName: settingsStore.cwd.split(/[/\\]/).pop() || 'Default',
    }
    sessionStore.addWorkspace(defaultWorkspace)
    sessionStore.setCurrentWorkspace(defaultWorkspace)
  }
}

// Watch for cwd changes
watch(() => settingsStore.cwd, (newCwd) => {
  if (newCwd && !sessionStore.currentWorkspace) {
    initializeWorkspace()
  }
})

// Initialize on mount
import { onMounted, onUnmounted } from 'vue'
onMounted(() => {
  initializeWorkspace()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="workspace-selector">
    <button class="workspace-button" @click="openDropdown">
      <span class="workspace-icon">📁</span>
      <span class="workspace-name">{{ currentWorkspaceDisplay }}</span>
      <span class="dropdown-arrow" :class="{ open: isOpen }">▼</span>
    </button>

    <div v-if="isOpen" class="workspace-dropdown">
      <div class="dropdown-header">
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="Search workspaces..."
          @click.stop
        />
      </div>

      <div class="dropdown-list">
        <div
          class="workspace-option"
          :class="{ active: !sessionStore.currentWorkspace }"
          @click="selectWorkspace(null)"
        >
          <span class="option-icon">🌐</span>
          <span class="option-name">All Workspaces</span>
        </div>

        <div
          v-for="workspace in filteredWorkspaces"
          :key="workspace.workspaceId"
          class="workspace-option"
          :class="{ active: workspace.workspaceId === sessionStore.currentWorkspace?.workspaceId }"
          @click="selectWorkspace(workspace)"
        >
          <span class="option-icon">📁</span>
          <span class="option-name">{{ workspace.displayName || workspace.path }}</span>
          <span class="option-path" :title="workspace.path">{{ workspace.path }}</span>
        </div>

        <div v-if="filteredWorkspaces.length === 0" class="empty-state">
          {{ searchQuery ? 'No matching workspaces' : 'No workspaces found' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-selector {
  position: relative;
  width: 100%;
}

.workspace-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.workspace-button:hover {
  border-color: var(--accent-color);
  background: var(--hover-bg);
}

.workspace-icon {
  flex-shrink: 0;
}

.workspace-name {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-arrow {
  flex-shrink: 0;
  font-size: 10px;
  transition: transform 0.15s;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.workspace-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 300px;
  display: flex;
  flex-direction: column;
}

.dropdown-header {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 12px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent-color);
}

.dropdown-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.workspace-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
}

.workspace-option:hover {
  background: var(--hover-bg);
}

.workspace-option.active {
  background: var(--badge-bg);
  border-color: var(--accent-color);
}

.option-icon {
  flex-shrink: 0;
}

.option-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-path {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted-color);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--muted-color);
  font-size: 12px;
}
</style>
