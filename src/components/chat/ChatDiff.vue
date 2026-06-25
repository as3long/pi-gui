<script setup lang="ts">
import { ref } from 'vue'
import DiffEditor from '../common/DiffEditor.vue'

interface DiffChange {
  oldCode: string
  newCode: string
  oldFilename?: string
  newFilename?: string
  language?: string
  description?: string
}

defineProps<{
  changes: DiffChange[]
}>()

const expandedIndex = ref<number | null>(null)

function toggleExpand(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}

// Get change type (added, removed, modified)
function getChangeType(change: DiffChange): string {
  if (!change.oldCode && change.newCode) return 'added'
  if (change.oldCode && !change.newCode) return 'removed'
  return 'modified'
}

// Get change icon
function getChangeIcon(type: string): string {
  const iconMap: Record<string, string> = {
    added: '➕',
    removed: '➖',
    modified: '✏️'
  }
  return iconMap[type] || '📝'
}

// Get change color class
function getChangeClass(type: string): string {
  const classMap: Record<string, string> = {
    added: 'change-added',
    removed: 'change-removed',
    modified: 'change-modified'
  }
  return classMap[type] || ''
}
</script>

<template>
  <div class="chat-diff">
    <!-- Header -->
    <div class="diff-header">
      <span class="diff-icon">📝</span>
      <span class="diff-title">Code Changes</span>
      <span class="diff-count">{{ changes.length }} file(s)</span>
    </div>
    
    <!-- Changes List -->
    <div class="changes-list">
      <div 
        v-for="(change, index) in changes" 
        :key="index"
        class="change-item"
      >
        <!-- Change Header -->
        <div 
          class="change-header"
          :class="getChangeClass(getChangeType(change))"
          @click="toggleExpand(index)"
        >
          <span class="change-icon">{{ getChangeIcon(getChangeType(change)) }}</span>
          <span class="change-filename">{{ change.newFilename || change.oldFilename || 'Untitled' }}</span>
          <span v-if="change.description" class="change-description">{{ change.description }}</span>
          <span class="expand-icon">{{ expandedIndex === index ? '▼' : '▶' }}</span>
        </div>
        
        <!-- Diff Editor (expanded) -->
        <div v-if="expandedIndex === index" class="change-content">
          <DiffEditor
            :old-code="change.oldCode"
            :new-code="change.newCode"
            :old-filename="change.oldFilename"
            :new-filename="change.newFilename"
            :language="change.language"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-diff {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-color);
  margin: 8px 0;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
}

.diff-icon {
  font-size: 1.1em;
}

.diff-title {
  font-size: 0.9em;
  font-weight: 500;
  color: var(--text-color);
}

.diff-count {
  font-size: 0.8em;
  color: var(--muted-color);
  margin-left: auto;
}

.changes-list {
  max-height: 400px;
  overflow-y: auto;
}

.change-item {
  border-bottom: 1px solid var(--border-color);
}

.change-item:last-child {
  border-bottom: none;
}

.change-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.change-header:hover {
  background: var(--hover-bg);
}

.change-header.change-added {
  border-left: 3px solid var(--success-color);
}

.change-header.change-removed {
  border-left: 3px solid var(--error-color);
}

.change-header.change-modified {
  border-left: 3px solid var(--warning-color);
}

.change-icon {
  font-size: 0.9em;
}

.change-filename {
  font-size: 0.85em;
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-color);
}

.change-description {
  font-size: 0.8em;
  color: var(--muted-color);
  flex: 1;
}

.expand-icon {
  font-size: 0.7em;
  color: var(--muted-color);
}

.change-content {
  border-top: 1px solid var(--border-color);
  height: 300px;
}
</style>
