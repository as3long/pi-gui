<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '../../stores/chat'
import { extractCodeBlocks, getTextWithoutCodeBlocks, computeDiffLines, type DiffLine } from './utils'
import DiffRenderer from '../common/DiffRenderer.vue'

const chatStore = useChatStore()

const streamingMessage = computed(() => chatStore.streamingMessage)

const textContent = computed(() => streamingMessage.value.text)
const thinkingContent = computed(() => streamingMessage.value.thinking)
const toolCalls = computed(() => streamingMessage.value.toolCalls)

const codeBlocks = computed(() => extractCodeBlocks(textContent.value))
const textWithoutCode = computed(() => getTextWithoutCodeBlocks(textContent.value))

// Diff cache
const diffCache = new Map<string, DiffLine[]>()

function getEditDiff(args: string): DiffLine[] {
  if (diffCache.has(args)) {
    return diffCache.get(args)!
  }

  try {
    const parsed = JSON.parse(args)
    if (!parsed.oldText || !parsed.newText) return []

    const lines = computeDiffLines(String(parsed.oldText), String(parsed.newText))
    if (diffCache.size > 50) diffCache.clear()
    diffCache.set(args, lines)
    return lines
  } catch {
    return []
  }
}

function getEditFilePath(args: string): string | undefined {
  try {
    return JSON.parse(args).path
  } catch {
    return undefined
  }
}

function getToolIcon(name: string): string {
  const icons: Record<string, string> = {
    edit: '✏️',
    write: '📝',
    read: '📖',
    bash: '💻',
  }
  return icons[name] || '🔧'
}
</script>

<template>
  <div v-if="!streamingMessage.isComplete" class="streaming-wrapper">
    <div class="message-row assistant-row">
      <div class="message-label">Pi</div>
      <div class="message-bubble assistant-bubble streaming-bubble">
        <!-- Thinking block -->
        <div v-if="thinkingContent" class="thinking-block">
          <details open>
            <summary class="thinking-header">🤔 Thinking</summary>
            <div class="thinking-content">{{ thinkingContent }}</div>
          </details>
        </div>

        <!-- Text content -->
        <div v-if="textContent" class="text-content">
          <DiffRenderer :text="textWithoutCode" />
          <div v-for="(block, idx) in codeBlocks" :key="idx" class="code-block">
            <div class="code-header">{{ block.language || 'code' }}</div>
            <pre class="code-content"><code>{{ block.code }}</code></pre>
          </div>
          <span class="cursor-blink">▊</span>
        </div>
        <div v-else class="text-content">
          <span class="cursor-blink">▊</span>
        </div>

        <!-- Tool calls -->
        <div v-if="toolCalls.length > 0" class="tool-calls">
          <div
            v-for="tc in toolCalls"
            :key="tc.id"
            class="tool-call-item"
          >
            <div class="tool-call-header">
              <span class="tool-icon">{{ getToolIcon(tc.name) }}</span>
              <span class="tool-name">{{ tc.name }}</span>
              <span v-if="tc.name === 'edit'" class="diff-badge">diff</span>
              <span v-if="tc.isComplete" class="tool-status done">✓</span>
              <span v-else class="tool-status running">⋯</span>
            </div>
            <!-- Edit tool diff view -->
            <div v-if="tc.name === 'edit' && getEditDiff(tc.args).length > 0" class="edit-diff">
              <div v-if="getEditFilePath(tc.args)" class="diff-file-path">📄 {{ getEditFilePath(tc.args) }}</div>
              <div class="diff-content">
                <div
                  v-for="(line, idx) in getEditDiff(tc.args)"
                  :key="idx"
                  class="diff-line"
                  :class="'diff-line--' + line.type"
                >
                  <span class="diff-line-prefix">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}</span>
                  <span class="diff-line-text">{{ line.text }}</span>
                </div>
              </div>
            </div>
            <!-- Non-edit tool args -->
            <details v-else-if="tc.args && tc.args !== '{}' && tc.name !== 'edit'" class="tool-args-details">
              <summary>Arguments</summary>
              <pre class="tool-args">{{ tc.args }}</pre>
            </details>
            <div v-if="tc.result" class="tool-result">
              <DiffRenderer :text="tc.result" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.streaming-wrapper {
  animation: fadeIn 0.15s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.message-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
}

.message-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-color);
  margin-bottom: 4px;
  padding: 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.message-bubble {
  width: min(720px, 100%);
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  line-height: 1.55;
  font-size: 13px;
}

.assistant-bubble {
  background: var(--assistant-bg);
}

.streaming-bubble {
  border-color: var(--accent-color);
}

.thinking-block {
  margin-bottom: 8px;
}

.thinking-header {
  font-size: 12px;
  color: var(--muted-color);
  cursor: pointer;
}

.thinking-content {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--thinking-bg);
  border-radius: 6px;
  font-size: 12px;
  color: var(--muted-color);
  white-space: pre-wrap;
}

.text-content {
  white-space: pre-wrap;
}

.code-block {
  margin: 8px 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.code-header {
  padding: 4px 12px;
  background: var(--header-bg);
  font-size: 11px;
  color: var(--muted-color);
  border-bottom: 1px solid var(--border-color);
}

.code-content {
  margin: 0;
  padding: 12px;
  background: var(--code-bg);
  font-family: 'SF Mono', monospace;
  font-size: 12px;
  overflow-x: auto;
}

.cursor-blink {
  animation: blink 1s infinite;
  color: var(--accent-color);
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.tool-calls {
  margin-top: 8px;
}

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
  font-size: 12px;
}

.tool-icon {
  font-size: 12px;
}

.tool-name {
  font-weight: 500;
  color: var(--text-color);
}

.diff-badge {
  padding: 2px 6px;
  background: var(--accent-color);
  color: white;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
}

.tool-status {
  margin-left: auto;
  font-size: 12px;
}

.tool-status.done {
  color: var(--success-color);
}

.tool-status.running {
  color: var(--warning-color);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  padding: 6px 10px;
  cursor: pointer;
  color: var(--muted-color);
}

.tool-args {
  margin: 0;
  padding: 8px 10px;
  background: var(--code-bg);
  font-size: 11px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-result {
  margin-top: 4px;
  padding: 8px 10px;
  background: var(--code-bg);
  font-size: 11px;
  border-top: 1px solid var(--border-color);
}
</style>
