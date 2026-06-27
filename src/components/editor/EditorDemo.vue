<script setup lang="ts">
import { ref } from 'vue'
import { CodeEditor } from '../editor'
import { notifySuccess } from '../../utils/notify'

const code = ref(`// Welcome to Pi GUI Code Editor!
// This is a CodeMirror 6 integration

function greet(name: string): string {
  return \`Hello, \${name}! Welcome to Pi GUI.\`
}

// Try editing this code
const message = greet('Developer')
console.log(message)

// Features:
// - Syntax highlighting
// - Auto completion
// - Bracket matching
// - Code folding
// - Search & replace
// - Multi-cursor support
`)

const language = ref<'javascript' | 'typescript' | 'python' | 'html' | 'css'>('javascript')
const theme = ref<'light' | 'dark'>('dark')

function handleSave(value: string) {
  console.log('Saved:', value)
  notifySuccess('Code saved! (Check console)')
}
</script>

<template>
  <div class="editor-demo">
    <div class="demo-header">
      <h3>CodeMirror 6 Editor Demo</h3>
      <div class="demo-controls">
        <select v-model="language" class="control-select">
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
        </select>
        <button 
          class="control-btn" 
          @click="theme = theme === 'dark' ? 'light' : 'dark'"
        >
          {{ theme === 'dark' ? '☀️ Light' : '🌙 Dark' }}
        </button>
      </div>
    </div>
    
    <div class="editor-container">
      <CodeEditor
        v-model="code"
        :language="language"
        :theme="theme"
        @save="handleSave"
      />
    </div>
    
    <div class="demo-footer">
      <p>💡 Tip: Press <kbd>Ctrl+S</kbd> to save</p>
    </div>
  </div>
</template>

<style scoped>
.editor-demo {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  background: var(--bg-color);
}

.demo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.demo-header h3 {
  margin: 0;
  font-size: 1.1em;
  color: var(--text-color);
}

.demo-controls {
  display: flex;
  gap: 8px;
}

.control-select {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.85em;
  cursor: pointer;
}

.control-select:focus {
  outline: none;
  border-color: var(--accent-color);
}

.control-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.85em;
  cursor: pointer;
  transition: all 0.15s;
}

.control-btn:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
}

.editor-container {
  flex: 1;
  min-height: 400px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.demo-footer {
  margin-top: 12px;
  text-align: center;
}

.demo-footer p {
  margin: 0;
  font-size: 0.8em;
  color: var(--muted-color);
}

kbd {
  padding: 2px 6px;
  background: var(--code-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: 'SF Mono', monospace;
  font-size: 0.9em;
}
</style>
