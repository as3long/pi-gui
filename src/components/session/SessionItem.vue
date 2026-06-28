<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, shortenPath } from './utils'
import type { SessionItem } from './utils'

const props = defineProps<{
  session: SessionItem
  isActive: boolean
  isDragOver: boolean
  isDragging: boolean
  tag?: { name: string; color: string } | null
}>()

// Format session title - show first user message or simplified path
const displayTitle = computed(() => {
  const name = props.session?.name || props.session?.id || 'Untitled'
  // If name looks like a path, extract the last meaningful part
  if (name.includes('\\') || name.includes('/')) {
    const parts = name.replace(/\\/g, '/').split('/').filter(Boolean)
    // Get last 2 meaningful parts
    return parts.slice(-2).join(' / ')
  }
  return name
})

const emit = defineEmits<{
  click: [path: string]
  dblclick: [session: SessionItem]
  fork: [id: string]
  delete: [session: SessionItem, event: MouseEvent]
  dragstart: [id: string]
  dragover: [id: string, event: DragEvent]
  dragleave: []
  drop: [id: string]
  dragend: []
}>()
</script>

<template>
  <div
    v-if="props.session"
    class="session-tree-item"
    :class="{
      active: props.isActive,
      'drag-over': props.isDragOver,
      dragging: props.isDragging,
    }"
    draggable="true"
    @click="emit('click', props.session.path)"
    @dblclick="emit('dblclick', props.session)"
    @dragstart="emit('dragstart', props.session.id)"
    @dragover="emit('dragover', props.session.id, $event)"
    @dragleave="emit('dragleave')"
    @drop="emit('drop', props.session.id)"
    @dragend="emit('dragend')"
  >
    <div class="drag-handle">⋮⋮</div>
    <div class="session-body">
      <div class="session-name" :title="props.session.name || props.session.id">{{ displayTitle }}</div>
      <div class="session-time">{{ props.session.createdAt ? formatDate(props.session.createdAt) : '' }}</div>
      <div class="session-row-meta">
        <span v-if="props.session.cwd" class="session-cwd" :title="props.session.cwd">
          📁 {{ shortenPath(props.session.cwd) }}
        </span>
        <span v-if="props.session.model" class="session-model">{{ props.session.model }}</span>
        <span v-if="props.session.messageCount" class="session-msgs">
          {{ props.session.messageCount }} msgs
        </span>
      </div>
    </div>
    <!-- Tags -->
    <div v-if="props.tag" class="session-tag" :class="props.tag.color">
      {{ props.tag.name }}
    </div>
    <!-- Actions -->
    <div class="session-actions">
      <button
        class="btn-session-action btn-fork"
        title="Fork Session"
        @click.stop="emit('fork', props.session.id)"
      >
        🍴
      </button>
      <button
        class="btn-session-action btn-delete"
        title="Delete Session"
        @click="emit('delete', props.session, $event as MouseEvent)"
      >
        🗑️
      </button>
    </div>
  </div>
</template>

<style scoped>
.session-tree-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
  margin-bottom: 2px;
}

.session-tree-item:hover {
  background: var(--hover-bg);
}

.session-tree-item.active {
  background: var(--badge-bg);
  border-color: var(--accent-color);
}

.session-tree-item.dragging {
  opacity: 0.4;
}

.session-tree-item.drag-over {
  border-top: 2px solid var(--accent-color);
}

.drag-handle {
  cursor: grab;
  color: var(--muted-color);
  font-size: 10px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  margin-top: 2px;
  line-height: 1;
}

.session-tree-item:hover .drag-handle {
  opacity: 0.5;
}

.drag-handle:active {
  cursor: grabbing;
}

.session-body {
  flex: 1;
  min-width: 0;
}

.session-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-time {
  font-size: 11px;
  color: var(--muted-color);
  line-height: 1.4;
  margin-top: 1px;
}

.session-row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted-color);
  line-height: 1.3;
  margin-top: 2px;
}

.session-cwd {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.7;
}

.session-model {
  flex-shrink: 0;
  color: var(--accent-color);
  opacity: 0.85;
  white-space: nowrap;
}

.session-msgs {
  flex-shrink: 0;
  white-space: nowrap;
  opacity: 0.6;
}

.session-tag {
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
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

.session-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.session-tree-item:hover .session-actions {
  opacity: 1;
}

.btn-session-action {
  background: none;
  border: none;
  border-radius: 4px;
  padding: 3px 5px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1;
}

.btn-session-action:hover {
  background: var(--hover-bg);
}

.btn-fork:hover {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.btn-delete:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}
</style>
