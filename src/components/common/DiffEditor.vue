<script setup lang="ts">
import { computed } from 'vue'

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

// Compute diff lines
const diffLines = computed(() => {
  const oldLines = props.oldCode.split('\n')
  const newLines = props.newCode.split('\n')
  const result: Array<{ type: 'add' | 'remove' | 'context'; text: string; lineNum?: number }> = []
  
  // Simple line-by-line diff
  const maxLen = Math.max(oldLines.length, newLines.length)
  let oldLineNum = 1
  let newLineNum = 1
  
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined
    const newLine = i < newLines.length ? newLines[i] : undefined
    
    if (oldLine === undefined) {
      // New line added
      result.push({ type: 'add', text: newLine || '', lineNum: newLineNum++ })
    } else if (newLine === undefined) {
      // Line removed
      result.push({ type: 'remove', text: oldLine, lineNum: oldLineNum++ })
    } else if (oldLine === newLine) {
      // Unchanged
      result.push({ type: 'context', text: oldLine, lineNum: oldLineNum++ })
      newLineNum++
    } else {
      // Modified
      result.push({ type: 'remove', text: oldLine, lineNum: oldLineNum++ })
      result.push({ type: 'add', text: newLine, lineNum: newLineNum++ })
    }
  }
  
  return result
})

// Diff stats
const diffStats = computed(() => {
  let added = 0
  let removed = 0
  for (const line of diffLines.value) {
    if (line.type === 'add') added++
    if (line.type === 'remove') removed++
  }
  return { added, removed }
})
</script>

<template>
  <div class="diff-editor">
    <!-- Header -->
    <div class="diff-header">
      <div class="diff-filenames">
        <span class="filename old">{{ oldFilename }}</span>
        <span class="arrow">→</span>
        <span class="filename new">{{ newFilename }}</span>
      </div>
      <div class="diff-stats">
        <span class="stat-added">+{{ diffStats.added }}</span>
        <span class="stat-removed">-{{ diffStats.removed }}</span>
      </div>
    </div>
    
    <!-- Diff Content -->
    <div class="diff-content">
      <div
        v-for="(line, index) in diffLines"
        :key="index"
        class="diff-line"
        :class="`diff-line-${line.type}`"
      >
        <span class="line-prefix">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}</span>
        <span class="line-text">{{ line.text }}</span>
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
  margin: 8px 0;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
}

.diff-filenames {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
}

.filename {
  font-family: 'SF Mono', Monaco, monospace;
  padding: 2px 8px;
  border-radius: 4px;
}

.filename.old {
  background: rgba(248, 81, 73, 0.2);
  color: #f85149;
}

.filename.new {
  background: rgba(46, 160, 67, 0.2);
  color: #2ea043;
}

.arrow {
  color: #888;
}

.diff-stats {
  display: flex;
  gap: 12px;
  font-size: 0.85em;
  font-family: 'SF Mono', Monaco, monospace;
}

.stat-added {
  color: #2ea043;
}

.stat-removed {
  color: #f85149;
}

.diff-content {
  max-height: 400px;
  overflow-y: auto;
  font-family: 'Source Code Pro', 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #d4d4d4;
}

.diff-line {
  display: flex;
  padding: 0 12px;
  min-height: 20px;
}

.diff-line-add {
  background: rgba(46, 160, 67, 0.2);
  border-left: 3px solid #2ea043;
}

.diff-line-remove {
  background: rgba(248, 81, 73, 0.2);
  border-left: 3px solid #f85149;
}

.diff-line-context {
  border-left: 3px solid transparent;
}

.line-prefix {
  width: 16px;
  flex-shrink: 0;
  user-select: none;
  text-align: center;
}

.diff-line-add .line-prefix {
  color: #2ea043;
}

.diff-line-remove .line-prefix {
  color: #f85149;
}

.line-text {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-all;
  padding-left: 8px;
  color: #d4d4d4;
}

/* Scrollbar styling */
.diff-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.diff-content::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.diff-content::-webkit-scrollbar-thumb {
  background: #3c3c3c;
  border-radius: 4px;
}

.diff-content::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
