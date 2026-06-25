<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { EditorView, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'

const props = withDefaults(defineProps<{
  oldCode: string
  newCode: string
  oldFilename?: string
  newFilename?: string
  language?: string
}>(), {
  oldFilename: 'before',
  newFilename: 'after',
  language: 'javascript'
})

const leftEditor = ref<HTMLElement | null>(null)
const rightEditor = ref<HTMLElement | null>(null)
let leftView: EditorView | null = null
let rightView: EditorView | null = null

// Diff stats
const diffStats = computed(() => {
  const oldLines = props.oldCode.split('\n')
  const newLines = props.newCode.split('\n')
  let added = 0
  let removed = 0
  let unchanged = 0
  
  // Simple line-by-line comparison
  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    if (i >= oldLines.length) {
      added++
    } else if (i >= newLines.length) {
      removed++
    } else if (oldLines[i] !== newLines[i]) {
      added++
      removed++
    } else {
      unchanged++
    }
  }
  
  return { added, removed, unchanged }
})

// Create editor with diff highlighting
function createEditor(
  parent: HTMLElement, 
  value: string
) {
  const state = EditorState.create({
    doc: value,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      javascript(),
      oneDark,
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      keymap.of(defaultKeymap),
      // Custom decoration for diff lines
      EditorView.theme({
        '.diff-line-add': {
          backgroundColor: 'rgba(46, 160, 67, 0.2)',
          borderLeft: '3px solid #2ea043'
        },
        '.diff-line-remove': {
          backgroundColor: 'rgba(248, 81, 73, 0.2)',
          borderLeft: '3px solid #f85149'
        },
        '.diff-line-modified': {
          backgroundColor: 'rgba(210, 153, 34, 0.2)',
          borderLeft: '3px solid #d29922'
        }
      })
    ]
  })
  
  return new EditorView({ state, parent })
}

// Initialize editors
onMounted(() => {
  if (leftEditor.value && rightEditor.value) {
    leftView = createEditor(leftEditor.value, props.oldCode)
    rightView = createEditor(rightEditor.value, props.newCode)
  }
})

// Watch for code changes
watch([() => props.oldCode, () => props.newCode], () => {
  if (leftView && rightView) {
    // Update editors with new content
    leftView.dispatch({
      changes: {
        from: 0,
        to: leftView.state.doc.length,
        insert: props.oldCode
      }
    })
    rightView.dispatch({
      changes: {
        from: 0,
        to: rightView.state.doc.length,
        insert: props.newCode
      }
    })
  }
})

// Cleanup
import { onUnmounted } from 'vue'
onUnmounted(() => {
  leftView?.destroy()
  rightView?.destroy()
})
</script>

<template>
  <div class="diff-editor">
    <!-- Header -->
    <div class="diff-header">
      <div class="diff-title">
        <span class="diff-icon">📝</span>
        <span>Code Changes</span>
      </div>
      <div class="diff-stats">
        <span class="stat-added">+{{ diffStats.added }}</span>
        <span class="stat-removed">-{{ diffStats.removed }}</span>
        <span class="stat-unchanged">{{ diffStats.unchanged }} unchanged</span>
      </div>
    </div>
    
    <!-- Editors Container -->
    <div class="diff-container">
      <!-- Left Editor (Old) -->
      <div class="diff-panel">
        <div class="panel-header old">
          <span class="panel-label">Before</span>
          <span class="panel-filename">{{ oldFilename }}</span>
        </div>
        <div ref="leftEditor" class="editor-panel"></div>
      </div>
      
      <!-- Divider -->
      <div class="diff-divider"></div>
      
      <!-- Right Editor (New) -->
      <div class="diff-panel">
        <div class="panel-header new">
          <span class="panel-label">After</span>
          <span class="panel-filename">{{ newFilename }}</span>
        </div>
        <div ref="rightEditor" class="editor-panel"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-editor {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e1e;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
}

.diff-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
  color: #cccccc;
  font-weight: 500;
}

.diff-icon {
  font-size: 1.1em;
}

.diff-stats {
  display: flex;
  gap: 12px;
  font-size: 0.8em;
  font-family: 'SF Mono', Monaco, monospace;
}

.stat-added {
  color: #2ea043;
}

.stat-removed {
  color: #f85149;
}

.stat-unchanged {
  color: #888;
}

.diff-container {
  display: flex;
  height: 400px;
}

.diff-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
}

.panel-header.old {
  border-left: 3px solid #f85149;
}

.panel-header.new {
  border-left: 3px solid #2ea043;
}

.panel-label {
  font-size: 0.75em;
  color: #888;
  text-transform: uppercase;
}

.panel-filename {
  font-size: 0.8em;
  color: #cccccc;
  font-family: 'SF Mono', Monaco, monospace;
}

.editor-panel {
  flex: 1;
  overflow: auto;
}

.diff-divider {
  width: 2px;
  background: #3c3c3c;
}

/* CodeMirror 样式覆盖 */
.diff-panel :deep(.cm-editor) {
  height: 100%;
}

.diff-panel :deep(.cm-scroller) {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.diff-panel :deep(.cm-gutters) {
  background: #1e1e1e;
  border-right: 1px solid #3c3c3c;
}
</style>
