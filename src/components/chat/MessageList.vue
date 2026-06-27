<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useChatStore } from '../../stores/chat'
import MessageItem from './MessageItem.vue'

const chatStore = useChatStore()
const messageListRef = ref<HTMLDivElement | null>(null)

// Parse edit tool diff from streaming tool call
interface DiffLine {
  type: 'add' | 'remove' | 'context'
  text: string
}

// Simple diff cache to avoid re-computing on every render
const diffCache = new Map<string, DiffLine[]>()
const MAX_DIFF_LINES = 200 // Limit diff computation for large edits

function parseEditDiff(args: string): DiffLine[] {
  // Check cache first
  if (diffCache.has(args)) {
    return diffCache.get(args)!
  }
  
  try {
    const parsed = JSON.parse(args)
    if (!parsed.oldText || !parsed.newText) return []
    
    const oldLines = parsed.oldText.split('\n')
    const newLines = parsed.newText.split('\n')
    
    // Skip expensive LCS for large diffs - just show add/remove lines
    if (oldLines.length + newLines.length > MAX_DIFF_LINES) {
      const result: DiffLine[] = []
      // Show removed lines
      for (const line of oldLines) {
        result.push({ type: 'remove', text: line })
      }
      // Show added lines
      for (const line of newLines) {
        result.push({ type: 'add', text: line })
      }
      diffCache.set(args, result)
      return result
    }
    
    // Simple LCS-based diff for small edits
    const result: DiffLine[] = []
    const lcs = computeLCS(oldLines, newLines)
    
    let oldIdx = 0
    let newIdx = 0
    let lcsIdx = 0
    
    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      if (lcsIdx < lcs.length && oldIdx < oldLines.length && newIdx < newLines.length &&
          oldLines[oldIdx] === lcs[lcsIdx] && newLines[newIdx] === lcs[lcsIdx]) {
        result.push({ type: 'context', text: oldLines[oldIdx] })
        oldIdx++
        newIdx++
        lcsIdx++
      } else if (lcsIdx < lcs.length && oldIdx < oldLines.length && oldLines[oldIdx] === lcs[lcsIdx]) {
        while (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
          result.push({ type: 'add', text: newLines[newIdx] })
          newIdx++
        }
      } else if (lcsIdx < lcs.length && newIdx < newLines.length && newLines[newIdx] === lcs[lcsIdx]) {
        while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcs[lcsIdx]) {
          result.push({ type: 'remove', text: oldLines[oldIdx] })
          oldIdx++
        }
      } else {
        while (oldIdx < oldLines.length) {
          result.push({ type: 'remove', text: oldLines[oldIdx] })
          oldIdx++
        }
        while (newIdx < newLines.length) {
          result.push({ type: 'add', text: newLines[newIdx] })
          newIdx++
        }
        break
      }
    }
    
    // Cache result (limit cache size)
    if (diffCache.size > 50) {
      diffCache.clear()
    }
    diffCache.set(args, result)
    return result
  } catch {
    return []
  }
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  
  const result: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  
  return result
}

// Get file path from edit tool args
function getEditFilePath(args: string): string | undefined {
  try {
    const parsed = JSON.parse(args)
    return parsed.path
  } catch {
    return undefined
  }
}

// Auto-scroll throttling - scroll at most once every 50ms
let scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null
let pendingScroll = false

function doScroll() {
  scrollThrottleTimer = null
  if (pendingScroll) {
    pendingScroll = false
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  }
}

function throttledScroll() {
  pendingScroll = true
  if (!scrollThrottleTimer) {
    nextTick(() => {
      doScroll()
      scrollThrottleTimer = setTimeout(doScroll, 50)
    })
  }
}

// Auto-scroll to bottom on new messages or streaming updates
watch(
  () => chatStore.messages.length,
  async () => {
    // Full scroll immediately for new messages
    await nextTick()
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  }
)

// Throttled scroll for streaming updates
watch(
  () => chatStore.streamingMessage.text.length,
  () => {
    throttledScroll()
  }
)

watch(
  () => chatStore.streamingMessage.thinking.length,
  () => {
    throttledScroll()
  }
)

// Scroll to bottom on mount
import { onMounted } from 'vue'
onMounted(async () => {
  await nextTick()
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
})
</script>

<template>
  <div ref="messageListRef" class="message-list">
    <!-- Empty state -->
    <div v-if="chatStore.messages.length === 0 && chatStore.streamingMessage.isComplete" class="empty-state">
      <div class="empty-icon">💬</div>
      <p class="empty-text">Send a message to start chatting with pi</p>
      <p class="empty-hint">Type a message and press Enter to send</p>
    </div>

    <!-- Historical messages -->
    <MessageItem
      v-for="(msg, index) in chatStore.messages"
      :key="'msg-' + index"
      :message="msg"
    />

    <!-- Streaming message (not yet finalized) -->
    <div v-if="!chatStore.streamingMessage.isComplete" class="streaming-wrapper">
      <div class="message-row assistant-row">
        <div class="message-label">Pi</div>
        <div class="message-bubble assistant-bubble streaming-bubble">
          <!-- Thinking block -->
          <div v-if="chatStore.streamingMessage.thinking" class="thinking-block">
            <details open>
              <summary class="thinking-header">🤔 Thinking</summary>
              <div class="thinking-content">{{ chatStore.streamingMessage.thinking }}</div>
            </details>
          </div>

          <!-- Text content -->
          <div v-if="chatStore.streamingMessage.text" class="text-content">
            {{ chatStore.streamingMessage.text }}<span class="cursor-blink">▊</span>
          </div>
          <div v-else class="text-content">
            <span class="cursor-blink">▊</span>
          </div>

          <!-- Tool calls -->
          <div v-if="chatStore.streamingMessage.toolCalls.length > 0" class="tool-calls">
            <div
              v-for="tc in chatStore.streamingMessage.toolCalls"
              :key="tc.id"
              class="tool-call-item"
            >
              <div class="tool-call-header">
                <span class="tool-icon">{{ tc.name === 'edit' ? '✏️' : tc.name === 'write' ? '📝' : tc.name === 'read' ? '📖' : tc.name === 'bash' ? '💻' : '🔧' }}</span>
                <span class="tool-name">{{ tc.name }}</span>
                <span v-if="tc.name === 'edit'" class="diff-badge">diff</span>
                <span v-if="tc.isComplete" class="tool-status done">✓</span>
                <span v-else class="tool-status running">⋯</span>
              </div>
              <!-- Edit tool diff view -->
              <div v-if="tc.name === 'edit' && parseEditDiff(tc.args).length > 0" class="edit-diff">
                <div v-if="getEditFilePath(tc.args)" class="diff-file-path">📄 {{ getEditFilePath(tc.args) }}</div>
                <div class="diff-content">
                  <div
                    v-for="(line, idx) in parseEditDiff(tc.args)"
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
                <pre>{{ tc.result }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  padding: 12px 16px;
  height: 100%;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted-color);
  text-align: center;
  padding: 40px;
}

.empty-icon {
  font-size: 3em;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 1.1em;
  margin-bottom: 8px;
  color: var(--text-color);
}

.empty-hint {
  font-size: 0.9em;
}

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

.user-row {
  align-items: flex-end;
}

.user-bubble {
  background: var(--user-bg);
  border-color: var(--user-border);
}

.assistant-row {
  align-items: flex-start;
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
  cursor: pointer;
  color: var(--muted-color);
  font-size: 0.9em;
  user-select: none;
}

.thinking-content {
  margin-top: 4px;
  padding: 8px;
  background: var(--thinking-bg);
  border-radius: 6px;
  font-size: 0.9em;
  color: var(--muted-color);
  font-style: italic;
  white-space: pre-wrap;
}

.text-content {
  color: var(--text-color);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.text-content :deep(p) {
  margin: 0;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: var(--accent-color);
}

@keyframes blink {
  50% { opacity: 0; }
}

.tool-calls {
  margin-top: 8px;
  border-top: 1px solid var(--border-color);
  padding-top: 8px;
}

.tool-call-item {
  margin-bottom: 6px;
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--tool-bg);
  border-radius: 4px;
  font-size: 0.85em;
  font-family: ui-monospace, 'SF Mono', monospace;
}

.tool-icon {
  font-size: 0.85em;
}

.tool-name {
  font-weight: 500;
}

.tool-status {
  margin-left: auto;
}

.tool-status.done {
  color: var(--success-color);
}

.tool-status.running {
  animation: pulse 1s step-end infinite;
  color: var(--accent-color);
}

@keyframes pulse {
  50% { opacity: 0; }
}

.tool-result {
  margin-top: 4px;
  padding: 8px;
  background: var(--code-bg);
  border-radius: 4px;
  font-size: 0.85em;
  overflow-x: auto;
}

.tool-result pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-badge {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-glow);
  color: var(--accent-color);
  font-size: 0.75em;
  font-weight: 500;
}

.edit-diff {
  margin-top: 4px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.diff-file-path {
  padding: 4px 10px;
  background: var(--tool-header-bg);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8em;
  font-family: ui-monospace, 'SF Mono', monospace;
  color: var(--muted-color);
}

.diff-content {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.82em;
  line-height: 1.5;
  overflow-x: auto;
  background: var(--code-bg);
}

.diff-line {
  display: flex;
  min-height: 1.5em;
  padding: 0 10px;
  white-space: pre;
}

.diff-line-prefix {
  width: 14px;
  flex-shrink: 0;
  text-align: center;
  font-weight: 700;
  user-select: none;
}

.diff-line-text {
  flex: 1;
  min-width: 0;
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

.tool-args-details {
  margin-top: 4px;
  font-size: 0.85em;
}

.tool-args-details summary {
  cursor: pointer;
  color: var(--muted-color);
  padding: 2px 8px;
}

.tool-args {
  margin: 4px 0 0;
  padding: 8px;
  background: var(--code-bg);
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.9em;
}
</style>
