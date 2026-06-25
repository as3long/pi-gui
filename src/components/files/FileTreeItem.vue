<script setup lang="ts">
import { computed } from 'vue'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  extension?: string
  size?: number
  modified?: string
}

const props = defineProps<{
  file: FileNode
  depth: number
  expandedDirs: Set<string>
  selectedFile: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle', path: string): void
  (e: 'select', file: FileNode): void
  (e: 'open', file: FileNode): void
  (e: 'contextmenu', event: MouseEvent, file: FileNode): void
}>()

const isExpanded = computed(() => props.expandedDirs.has(props.file.path))
const isSelected = computed(() => props.selectedFile === props.file.path)
const hasChildren = computed(() => props.file.children && props.file.children.length > 0)

// Get file icon
function getFileIcon(): string {
  if (props.file.type === 'directory') {
    return isExpanded.value ? '📂' : '📁'
  }
  
  const ext = props.file.name.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, string> = {
    'js': '🟨',
    'jsx': '⚛️',
    'ts': '🔷',
    'tsx': '⚛️',
    'py': '🐍',
    'html': '🌐',
    'css': '🎨',
    'json': '📋',
    'md': '📝',
    'vue': '💚',
    'rs': '🦀',
    'go': '🔵',
    'java': '☕',
    'png': '🖼️',
    'jpg': '🖼️',
    'gif': '🖼️',
    'svg': '🖼️',
    'lock': '🔒',
    'gitignore': '🙈',
    'env': '🔐'
  }
  return iconMap[ext] || '📄'
}

// Sort children: directories first, then files
const sortedChildren = computed(() => {
  if (!props.file.children) return []
  return [...props.file.children].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === 'directory' ? -1 : 1
  })
})

function handleClick() {
  if (props.file.type === 'directory') {
    emit('toggle', props.file.path)
  } else {
    emit('select', props.file)
  }
}

function handleDoubleClick() {
  emit('open', props.file)
}

function handleContextMenu(event: MouseEvent) {
  emit('contextmenu', event, props.file)
}
</script>

<template>
  <div class="tree-item-wrapper">
    <!-- Item -->
    <div
      class="tree-item"
      :class="{ selected: isSelected, directory: file.type === 'directory' }"
      :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
      @click="handleClick"
      @dblclick="handleDoubleClick"
      @contextmenu="handleContextMenu"
    >
      <!-- Expand arrow for directories -->
      <span v-if="file.type === 'directory'" class="expand-arrow" :class="{ expanded: isExpanded }">
        ▶
      </span>
      <span v-else class="expand-arrow placeholder"></span>
      
      <!-- File icon -->
      <span class="file-icon">{{ getFileIcon() }}</span>
      
      <!-- File name -->
      <span class="file-name">{{ file.name }}</span>
      
      <!-- File size (for files) -->
      <span v-if="file.type === 'file' && file.size" class="file-size">
        {{ file.size < 1024 ? file.size + ' B' : (file.size / 1024).toFixed(1) + ' KB' }}
      </span>
    </div>
    
    <!-- Children (if expanded) -->
    <div v-if="file.type === 'directory' && isExpanded && hasChildren" class="tree-children">
      <FileTreeItem
        v-for="child in sortedChildren"
        :key="child.path"
        :file="child"
        :depth="depth + 1"
        :expanded-dirs="expandedDirs"
        :selected-file="selectedFile"
        @toggle="$emit('toggle', $event)"
        @select="$emit('select', $event)"
        @open="$emit('open', $event)"
        @contextmenu="(e, f) => $emit('contextmenu', e, f)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-item-wrapper {
  user-select: none;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 0.85em;
  color: var(--text-color);
  transition: background 0.1s;
}

.tree-item:hover {
  background: var(--hover-bg);
}

.tree-item.selected {
  background: var(--badge-bg);
  border-left: 2px solid var(--accent-color);
}

.tree-item.directory {
  font-weight: 500;
}

.expand-arrow {
  width: 12px;
  font-size: 0.7em;
  color: var(--muted-color);
  transition: transform 0.15s;
}

.expand-arrow.expanded {
  transform: rotate(90deg);
}

.expand-arrow.placeholder {
  visibility: hidden;
}

.file-icon {
  font-size: 1em;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 0.8em;
  color: var(--muted-color);
  flex-shrink: 0;
}

.tree-children {
  /* Children container */
}
</style>
