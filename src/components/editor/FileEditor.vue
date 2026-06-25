<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { CodeEditor } from '../editor'
import { readFile, writeFile, openFileDialog, saveFileDialog } from '../../utils/fileOperations'

const props = defineProps<{
  filePath?: string
}>()

const emit = defineEmits<{
  (e: 'save', path: string): void
  (e: 'error', error: string): void
}>()

const content = ref('')
const isLoading = ref(false)
const isModified = ref(false)
const currentPath = ref(props.filePath || '')
const language = ref('javascript')

// Detect language from file extension
function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
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
    'md': 'markdown',
    'vue': 'javascript',
    'rs': 'javascript',
    'go': 'javascript',
    'java': 'javascript'
  }
  return langMap[ext] || 'javascript'
}

// Load file content
async function loadFile(path: string) {
  if (!path) return
  
  isLoading.value = true
  try {
    const fileContent = await readFile(path)
    content.value = fileContent
    currentPath.value = path
    language.value = detectLanguage(path)
    isModified.value = false
  } catch (error) {
    emit('error', `Failed to load file: ${error}`)
  } finally {
    isLoading.value = false
  }
}

// Save file content
async function saveFile() {
  if (!currentPath.value) {
    await saveAs()
    return
  }
  
  isLoading.value = true
  try {
    await writeFile(currentPath.value, content.value)
    isModified.value = false
    emit('save', currentPath.value)
  } catch (error) {
    emit('error', `Failed to save file: ${error}`)
  } finally {
    isLoading.value = false
  }
}

// Save as new file
async function saveAs() {
  const newPath = await saveFileDialog({
    title: 'Save File',
    defaultPath: currentPath.value,
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'JavaScript', extensions: ['js'] },
      { name: 'TypeScript', extensions: ['ts'] },
      { name: 'Python', extensions: ['py'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'CSS', extensions: ['css'] }
    ]
  })
  
  if (newPath) {
    currentPath.value = newPath
    await saveFile()
  }
}

// Open file
async function openFile() {
  const result = await openFileDialog({
    title: 'Open File',
    multiple: false,
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'JavaScript', extensions: ['js'] },
      { name: 'TypeScript', extensions: ['ts'] },
      { name: 'Python', extensions: ['py'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'CSS', extensions: ['css'] }
    ]
  })
  
  if (result && typeof result === 'string') {
    await loadFile(result)
  }
}

// Handle content change
function handleContentChange(value: string) {
  content.value = value
  isModified.value = true
}

// Handle save shortcut (Ctrl+S)
function handleSave() {
  saveFile()
}

// Watch for external path changes
watch(() => props.filePath, (newPath) => {
  if (newPath) {
    loadFile(newPath)
  }
})

// Get filename from path
const filename = computed(() => {
  if (!currentPath.value) return 'Untitled'
  return currentPath.value.split('/').pop() || 'Untitled'
})
</script>

<template>
  <div class="file-editor">
    <!-- Toolbar -->
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <button class="toolbar-btn" @click="openFile" title="Open File">
          📂 Open
        </button>
        <button class="toolbar-btn" @click="saveFile" :disabled="!isModified" title="Save (Ctrl+S)">
          💾 Save
        </button>
        <button class="toolbar-btn" @click="saveAs" title="Save As">
          📝 Save As
        </button>
      </div>
      <div class="toolbar-right">
        <span v-if="isLoading" class="status loading">Loading...</span>
        <span v-else-if="isModified" class="status modified">● Modified</span>
        <span class="filename">{{ filename }}</span>
      </div>
    </div>
    
    <!-- Editor -->
    <div class="editor-container">
      <CodeEditor
        :model-value="content"
        :language="language as any"
        theme="dark"
        @update:model-value="handleContentChange"
        @save="handleSave"
      />
    </div>
  </div>
</template>

<style scoped>
.file-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-left {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  font-size: 0.85em;
  cursor: pointer;
  transition: all 0.15s;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--accent-color);
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85em;
}

.status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8em;
}

.status.loading {
  color: var(--warning-color);
  background: var(--warning-bg);
}

.status.modified {
  color: var(--accent-color);
  background: var(--badge-bg);
}

.filename {
  color: var(--muted-color);
  font-family: 'SF Mono', Monaco, monospace;
}

.editor-container {
  flex: 1;
  min-height: 300px;
}
</style>
