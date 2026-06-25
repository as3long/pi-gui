<script setup lang="ts">
import { computed } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'

const props = defineProps<{
  text: string
}>()

// Detect if the content looks like a diff
const isDiff = computed(() => {
  const lines = props.text.split('\n')
  let diffLines = 0
  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@ ')) {
      diffLines++
    }
    // Lines starting with + or - (but not +++/---)
    if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++ ') && !line.startsWith('--- ')) {
      diffLines++
    }
  }
  return diffLines > 3
})

const diffLines = computed(() => {
  if (!isDiff.value) return []
  return props.text.split('\n').map((line) => ({
    text: line,
    type: getLineType(line),
  }))
})

type LineType = 'header' | 'add' | 'remove' | 'context' | 'position'

function getLineType(line: string): LineType {
  if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
    return 'header'
  }
  if (line.startsWith('--- ') || line.startsWith('+++ ')) {
    return 'header'
  }
  if (line.startsWith('@@ ')) {
    return 'position'
  }
  if (line.startsWith('+')) {
    return 'add'
  }
  if (line.startsWith('-')) {
    return 'remove'
  }
  return 'context'
}
</script>

<template>
  <div class="diff-renderer" :class="{ 'is-diff': isDiff }">
    <!-- If detected as diff, render with color -->
    <div v-if="isDiff" class="diff-content">
      <div
        v-for="(line, idx) in diffLines"
        :key="idx"
        class="diff-line"
        :class="'diff-line--' + line.type"
      >
        <span class="diff-line-number">{{ idx + 1 }}</span>
        <span class="diff-line-prefix">{{ line.text.charAt(0) }}</span>
        <span class="diff-line-text">{{ line.text.slice(1) || '' }}</span>
      </div>
    </div>
    <!-- Otherwise render as normal markdown -->
    <MarkdownRenderer v-else :text="text" />
  </div>
</template>

<style scoped>
.diff-renderer.is-diff {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85em;
  line-height: 1.55;
  background: var(--code-bg);
  border-radius: 6px;
  overflow: hidden;
}

.diff-content {
  overflow-x: auto;
}

.diff-line {
  display: flex;
  align-items: stretch;
  min-height: 1.55em;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-line-number {
  width: 32px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 8px;
  color: var(--muted-color);
  opacity: 0.5;
  font-size: 0.85em;
  user-select: none;
}

.diff-line-prefix {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
  font-weight: 700;
  color: var(--muted-color);
}

.diff-line-text {
  flex: 1;
  min-width: 0;
}

/* Line types */
.diff-line--header {
  background: var(--info-bg);
  color: var(--text-color);
  font-weight: 500;
}

.diff-line--position {
  background: var(--info-bg);
  color: var(--accent-color);
  font-weight: 500;
}

.diff-line--add {
  background: var(--success-bg);
  color: var(--success-color);
}

.diff-line--add .diff-line-prefix {
  color: var(--success-color);
}

.diff-line--remove {
  background: var(--error-bg);
  color: var(--error-color);
}

.diff-line--remove .diff-line-prefix {
  color: var(--error-color);
}

.diff-line--context {
  color: var(--text-color);
}

.diff-line:first-child {
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}

.diff-line:last-child {
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}
</style>
