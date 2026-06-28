<script setup lang="ts">
import { computed, ref } from 'vue'
import DiffEditor from '../common/DiffEditor.vue'

const props = defineProps<{
  name: string
  args: string
  isComplete?: boolean
  isError?: boolean
  result?: string
}>()

const isOpen = ref(true)

const isEditTool = computed(() => props.name === 'edit')

const parsedArgs = computed(() => {
  try {
    // Handle both string and object arguments
    if (typeof props.args === 'string') {
      return JSON.parse(props.args)
    }
    return props.args  // Already an object
  } catch {
    return null
  }
})

const editOldText = computed(() => {
  if (!parsedArgs.value) return ''
  // Handle nested edits array structure
  const edits = parsedArgs.value.edits || []
  const firstEdit = edits[0] || {}
  return firstEdit.oldText ? String(firstEdit.oldText) : (parsedArgs.value.oldText ? String(parsedArgs.value.oldText) : '')
})

const editNewText = computed(() => {
  if (!parsedArgs.value) return ''
  // Handle nested edits array structure
  const edits = parsedArgs.value.edits || []
  const firstEdit = edits[0] || {}
  return firstEdit.newText ? String(firstEdit.newText) : (parsedArgs.value.newText ? String(parsedArgs.value.newText) : '')
})
</script>

<template>
  <div class="tool-call-item">
    <div class="tool-call-header" @click="isOpen = !isOpen">
      <span class="tool-icon">🔧</span>
      <span class="tool-name">{{ name }}</span>
      <span v-if="!isComplete" class="tool-status running">⏳</span>
      <span v-else-if="isError" class="tool-status error">❌</span>
      <span v-else class="tool-status done">✅</span>
      <span class="toggle-icon">{{ isOpen ? '▼' : '▶' }}</span>
    </div>
    <div v-if="isOpen" class="tool-call-body">
      <!-- Edit tool diff view -->
      <DiffEditor
        v-if="isEditTool && editOldText && editNewText"
        :old-code="editOldText"
        :new-code="editNewText"
        :old-filename="parsedArgs?.path ? String(parsedArgs.path) : 'before'"
        :new-filename="parsedArgs?.path ? String(parsedArgs.path) : 'after'"
      />
      <!-- Non-edit tool args -->
      <details v-else-if="args && args !== '{}'" class="tool-args-details">
        <summary>Arguments</summary>
        <pre class="tool-args">{{ args }}</pre>
      </details>
    </div>
  </div>
</template>

<style scoped>
.tool-call-item {
  margin: 4px 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--tool-header-bg);
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}

.tool-call-header:hover {
  background: var(--hover-bg);
}

.tool-icon {
  font-size: 12px;
}

.tool-name {
  font-weight: 500;
  color: var(--text-color);
}

.tool-status {
  font-size: 10px;
}

.tool-status.running {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.toggle-icon {
  margin-left: auto;
  font-size: 10px;
  color: var(--muted-color);
}

.tool-call-body {
  padding: 8px 10px;
  background: var(--tool-bg);
}

.edit-diff {
  font-family: 'SF Mono', monospace;
  font-size: 12px;
}

.diff-file-path {
  padding: 4px 8px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--muted-color);
}

.diff-content {
  max-height: 300px;
  overflow-y: auto;
}

.diff-line {
  display: flex;
  padding: 1px 8px;
  font-family: 'SF Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
}

.diff-line--add {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.diff-line--remove {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.diff-line--context {
  color: var(--muted-color);
}

.diff-line-prefix {
  width: 16px;
  flex-shrink: 0;
  user-select: none;
}

.diff-line-text {
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-args-details {
  font-size: 12px;
}

.tool-args-details summary {
  cursor: pointer;
  color: var(--muted-color);
}

.tool-args {
  margin-top: 4px;
  padding: 8px;
  background: var(--code-bg);
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-result {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}
</style>
