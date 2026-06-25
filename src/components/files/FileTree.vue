<script setup lang="ts">
import { ref, computed } from 'vue'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  extension?: string
  size?: number
  modified?: string
}

const props = withDefaults(defineProps<{
  files: FileNode[]
  rootName?: string
  selectable?: boolean
}>(), {
  rootName: 'Project',
  selectable: true
})

const emit = defineEmits<{
  (e: 'select', file: FileNode): void
  (e: 'open', file: FileNode): void
  (e: 'rename', file: FileNode, newName: string): void
  (e: 'delete', file: FileNode): void
  (e: 'refresh'): void
}>()

const expandedDirs = ref<Set<string>>(new Set(['']))
const selectedFile = ref<string | null>(null)
const searchQuery = ref('')
const contextMenu = ref<{ x: number; y: number; file: FileNode } | null>(null)

// Toggle directory expansion
function toggleDir(path: string) {
  if (expandedDirs.value.has(path)) {
    expandedDirs.value.delete(path)
  } else {
    expandedDirs.value.add(path)
  }
}

// Select file
function selectFile(file: FileNode) {
  if (!props.selectable) return
  selectedFile.value = file.path
  emit('select', file)
}

// Open file (double click)
function openFile(file: FileNode) {
  if (file.type === 'file') {
    emit('open', file)
  } else {
    toggleDir(file.path)
  }
}

function handleRename() {
  const newName = window.prompt('New name:', contextMenu.value?.file.name)
  if (newName && contextMenu.value) {
    emit('rename', contextMenu.value.file, newName)
  }
  hideContextMenu()
}

// Show context menu
function showContextMenu(event: MouseEvent, file: FileNode) {
  event.preventDefault()
  contextMenu.value = { x: event.clientX, y: event.clientY, file }
}

// Hide context menu
function hideContextMenu() {
  contextMenu.value = null
}

// Filter files based on search
const filteredFiles = computed(() => {
  if (!searchQuery.value) return props.files
  
  const query = searchQuery.value.toLowerCase()
  function filterNodes(nodes: FileNode[]): FileNode[] {
    return nodes.filter(node => {
      if (node.name.toLowerCase().includes(query)) return true
      if (node.type === 'directory' && node.children) {
        node.children = filterNodes(node.children)
        return node.children.length > 0
      }
      return false
    })
  }
  
  return filterNodes(props.files)
})
</script>

<template>
  <div class="file-tree" @click="hideContextMenu">
    <!-- Header -->
    <div class="tree-header">
      <div class="tree-title">
        <span class="tree-icon">📁</span>
        <span>{{ rootName }}</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" title="Refresh" @click="$emit('refresh')">
          🔄
        </button>
      </div>
    </div>
    
    <!-- Search -->
    <div class="search-wrapper">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="Search files..."
      />
    </div>
    
    <!-- Tree Content -->
    <div class="tree-content">
      <div v-if="filteredFiles.length === 0" class="empty-state">
        {{ searchQuery ? 'No matching files' : 'No files' }}
      </div>
      
      <!-- Recursive tree renderer -->
      <div v-for="file in filteredFiles" :key="file.path">
        <FileTreeItem
          :file="file"
          :depth="0"
          :expanded-dirs="expandedDirs"
          :selected-file="selectedFile"
          @toggle="toggleDir"
          @select="selectFile"
          @open="openFile"
          @contextmenu="showContextMenu"
        />
      </div>
    </div>
    
    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="context-item" @click="emit('open', contextMenu.file)">
          📂 Open
        </div>
        <div class="context-item" @click="handleRename">
          ✏️ Rename
        </div>
        <div class="context-divider"></div>
        <div class="context-item danger" @click="emit('delete', contextMenu.file)">
          🗑️ Delete
        </div>
      </div>
    </Teleport>
  </div>
</template>

<!-- File Tree Item Component (recursive) -->
<script lang="ts">
// This needs to be defined separately for recursive rendering
</script>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
  border-right: 1px solid var(--border-color);
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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-color);
}

.tree-icon {
  font-size: 1.1em;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  background: none;
  border: none;
  font-size: 1em;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.action-btn:hover {
  background: var(--hover-bg);
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

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--muted-color);
  font-size: 0.85em;
}

.context-menu {
  position: fixed;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  min-width: 160px;
  z-index: 1000;
  padding: 4px 0;
}

.context-item {
  padding: 8px 16px;
  font-size: 0.85em;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s;
}

.context-item:hover {
  background: var(--hover-bg);
}

.context-item.danger {
  color: var(--error-color);
}

.context-item.danger:hover {
  background: var(--error-bg);
}

.context-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
</style>
