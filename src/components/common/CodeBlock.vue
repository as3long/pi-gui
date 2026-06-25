<script setup lang="ts">
import { ref, computed } from 'vue'
import { CodeEditor } from '../editor'

const props = defineProps<{
  code: string
  language?: string
  filename?: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  (e: 'save', value: string): void
  (e: 'copy', value: string): void
}>()

const isExpanded = ref(false)
const copied = ref(false)

// Detect language from filename or code content
const detectedLanguage = computed(() => {
  if (props.language) return props.language
  if (props.filename) {
    const ext = props.filename.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'javascript',
      'tsx': 'javascript',
      'py': 'python',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'json': 'javascript',
      'md': 'markdown'
    }
    return langMap[ext || ''] || 'javascript'
  }
  return 'javascript'
})

// Get file icon based on extension
const fileIcon = computed(() => {
  if (!props.filename) return '📄'
  const ext = props.filename.split('.').pop()?.toLowerCase()
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
    'java': '☕'
  }
  return iconMap[ext || ''] || '📄'
})

async function handleCopy() {
  await navigator.clipboard.writeText(props.code)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
  emit('copy', props.code)
}

function handleSave(value: string) {
  emit('save', value)
}
</script>

<template>
  <div class="code-block" :class="{ expanded: isExpanded }">
    <!-- Header -->
    <div class="code-header">
      <div class="file-info">
        <span class="file-icon">{{ fileIcon }}</span>
        <span v-if="filename" class="filename">{{ filename }}</span>
        <span v-else class="language-tag">{{ detectedLanguage }}</span>
      </div>
      <div class="header-actions">
        <button 
          class="action-btn" 
          :class="{ copied }"
          @click="handleCopy"
          title="Copy code"
        >
          {{ copied ? '✓ Copied' : '📋 Copy' }}
        </button>
        <button 
          class="action-btn"
          @click="isExpanded = !isExpanded"
          title="Toggle expand"
        >
          {{ isExpanded ? '▼ Collapse' : '▶ Expand' }}
        </button>
      </div>
    </div>
    
    <!-- Code Content -->
    <div class="code-content" :class="{ collapsed: !isExpanded }">
      <CodeEditor
        :model-value="code"
        :language="detectedLanguage as any"
        :read-only="readOnly !== false"
        theme="dark"
        @save="handleSave"
      />
    </div>
  </div>
</template>

<style scoped>
.code-block {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e1e;
  margin: 8px 0;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  font-size: 1em;
}

.filename {
  font-size: 0.85em;
  color: #cccccc;
  font-family: 'SF Mono', Monaco, monospace;
}

.language-tag {
  font-size: 0.75em;
  color: #888;
  padding: 2px 8px;
  background: #3c3c3c;
  border-radius: 4px;
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 4px 10px;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background: #2d2d2d;
  color: #cccccc;
  font-size: 0.75em;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: #3c3c3c;
  border-color: #569cd6;
}

.action-btn.copied {
  background: #2ea043;
  border-color: #2ea043;
  color: white;
}

.code-content {
  height: 300px;
  transition: height 0.3s ease;
}

.code-content.collapsed {
  height: 150px;
  overflow: hidden;
}

.code-content.expanded {
  height: 500px;
}

/* 覆盖 CodeMirror 样式 */
.code-block :deep(.cm-editor) {
  background: #1e1e1e;
}

.code-block :deep(.cm-scroller) {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.code-block :deep(.cm-gutters) {
  background: #1e1e1e;
  border-right: 1px solid #3c3c3c;
}
</style>
