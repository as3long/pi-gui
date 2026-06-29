<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useChatStore } from '../../stores/chat'
import DiffRenderer from '../common/DiffRenderer.vue'
import type { DiffLine } from './utils'
import { computeDiffLines } from './utils'

const chatStore = useChatStore()

const streamingMessage = computed(() => chatStore.streamingMessage)

// ── Debounced display text (150ms) ──
// The raw streaming text updates every 16ms, but we only need to re-render
// the expensive markdown/diff every 150ms for smooth display.
const displayText = ref('')
const displayThinking = ref('')
let displayTimer: ReturnType<typeof setTimeout> | null = null

const STREAMING_RENDER_INTERVAL = 150 // ms

function flushDisplay() {
  displayText.value = streamingMessage.value.text
  displayThinking.value = streamingMessage.value.thinking
  displayTimer = null
}

watch(
  () => streamingMessage.value.text,
  () => {
    if (!displayTimer) {
      displayTimer = setTimeout(flushDisplay, STREAMING_RENDER_INTERVAL)
    }
  }
)

watch(
  () => streamingMessage.value.thinking,
  () => {
    if (!displayTimer) {
      displayTimer = setTimeout(flushDisplay, STREAMING_RENDER_INTERVAL)
    }
  }
)

// Flush immediately when streaming completes
watch(
  () => streamingMessage.value.isComplete,
  (complete) => {
    if (complete && displayTimer) {
      clearTimeout(displayTimer)
      displayTimer = null
      displayText.value = streamingMessage.value.text
      displayThinking.value = streamingMessage.value.thinking
    }
  }
)

const toolCalls = computed(() => streamingMessage.value.toolCalls)

// ── Tool result truncation ──
// During streaming, large tool results can cause significant lag.
// We truncate to a reasonable limit and show a notice.
const MAX_STREAMING_RESULT_CHARS = 8192  // 8KB during streaming

function getTruncatedResult(result: string): string {
  if (result.length <= MAX_STREAMING_RESULT_CHARS) return result
  return result.slice(-MAX_STREAMING_RESULT_CHARS) + '\n\n--- 输出过长，已截断显示最新内容 ---'
}

// ── Edit tool diff (lazy, only for complete tool calls or small args) ──
const diffCache = new Map<string, DiffLine[]>()

function getEditDiff(tcId: string, args: string, isComplete: boolean): DiffLine[] {
  // Skip expensive diff during streaming for large args
  if (!isComplete && args.length > 4096) return []

  const cacheKey = `${tcId}:${args.length}`
  if (diffCache.has(cacheKey)) return diffCache.get(cacheKey)!

  try {
    const parsed = JSON.parse(args)
    if (!parsed.oldText || !parsed.newText) return []

    const lines = computeDiffLines(String(parsed.oldText), String(parsed.newText))
    if (diffCache.size > 20) diffCache.clear()
    diffCache.set(cacheKey, lines)
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
        <div v-if="displayThinking" class="thinking-block">
          <details open>
            <summary class="thinking-header">🤔 Thinking</summary>
            <div class="thinking-content">{{ displayThinking }}</div>
          </details>
        </div>

        <!-- Text content - use debounced display text with DiffRenderer -->
        <div v-if="displayText" class="text-content">
          <DiffRenderer :text="displayText" />
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
              <span v-if="tc.name === 'edit' && tc.args.length < 4096" class="diff-badge">diff</span>
              <span v-if="tc.isComplete" class="tool-status done">✓</span>
              <span v-else class="tool-status running">⋯</span>
            </div>
            <!-- Edit tool diff view (only when complete or small) -->
            <div v-if="tc.name === 'edit' && getEditDiff(tc.id, tc.args, tc.isComplete).length > 0" class="edit-diff">
              <div v-if="getEditFilePath(tc.args)" class="diff-file-path">📄 {{ getEditFilePath(tc.args) }}</div>
              <div class="diff-content">
                <div
                  v-for="(line, idx) in getEditDiff(tc.id, tc.args, tc.isComplete)"
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
            <!-- Tool result (truncated during streaming) -->
            <div v-if="tc.result" class="tool-result">
              <DiffRenderer :text="getTruncatedResult(tc.result)" />
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
  max-height: 300px;
  overflow-y: auto;
}
</style>
