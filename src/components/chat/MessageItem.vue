<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentMessage, AssistantMessage, UserMessage, ToolResultMessage } from '../../ipc/types'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import DiffRenderer from '../common/DiffRenderer.vue'
import CodeBlock from '../common/CodeBlock.vue'
import { useChatStore } from '../../stores/chat'

const chatStore = useChatStore()

const props = defineProps<{
  message: AgentMessage
}>()

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')
const isToolResult = computed(() => props.message.role === 'toolResult')

// Show/hide tool calls
const showToolCalls = ref(true)

const assistantMsg = computed(() => props.message as AssistantMessage)
const userMsg = computed(() => props.message as UserMessage)
const toolResultMsg = computed(() => props.message as ToolResultMessage)

const textContent = computed(() => {
  if (isUser.value) {
    const content = userMsg.value.content
    if (typeof content === 'string') return content
    return content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n')
  }
  if (isAssistant.value) {
    return assistantMsg.value.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n')
  }
  return ''
})

const thinkingContent = computed(() => {
  if (!isAssistant.value) return ''
  return assistantMsg.value.content.filter(c => c.type === 'thinking').map(c => (c as { thinking: string }).thinking).join('\n')
})

interface ToolCallInfo {
  id: string
  name: string
  args: string
  diff?: { oldText: string; newText: string; filePath?: string } | null
}

// Find corresponding tool call for toolResult message
const correspondingToolCall = computed(() => {
  if (!isToolResult.value) return null
  const resultMsg = props.message as ToolResultMessage
  // Find in messages array - look for the assistant message before this toolResult
  const msgIndex = chatStore.messages.indexOf(props.message)
  for (let i = msgIndex - 1; i >= 0; i--) {
    const msg = chatStore.messages[i]
    if (msg.role === 'assistant') {
      const assistantMsg = msg as AssistantMessage
      const tc = assistantMsg.content.find(
        c => c.type === 'toolCall' && (c as any).id === resultMsg.toolCallId
      )
      if (tc) {
        const args = (tc as any).arguments
        const name = (tc as any).name
        return {
          name,
          args,
          diff: name === 'edit' && args.oldText && args.newText ? {
            oldText: String(args.oldText),
            newText: String(args.newText),
            filePath: args.path ? String(args.path) : undefined,
          } : null
        }
      }
      break
    }
  }
  return null
})

const toolCalls = computed(() => {
  if (!isAssistant.value) return []
  return assistantMsg.value.content.filter(c => c.type === 'toolCall').map(c => {
    const args = (c as { arguments: Record<string, unknown> }).arguments
    const name = (c as { name: string }).name
    const id = (c as { id: string }).id
    
    // Parse edit tool diff
    let diff: ToolCallInfo['diff'] = null
    if (name === 'edit' && args.oldText && args.newText) {
      diff = {
        oldText: String(args.oldText),
        newText: String(args.newText),
        filePath: args.path ? String(args.path) : undefined,
      }
    }
    
    return {
      id,
      name,
      args: JSON.stringify(args, null, 2),
      diff,
    }
  })
})

// Compute line-by-line diff for edit tool
interface DiffLine {
  type: 'add' | 'remove' | 'context'
  oldLineNum?: number
  newLineNum?: number
  text: string
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
  
  // Backtrack
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

// Extract code blocks from text
const codeBlocks = computed(() => {
  const text = textContent.value
  const blocks: Array<{ code: string; language: string; filename?: string }> = []
  const regex = /```(\w+)?\s*(?:filename="([^"]+)")?\s*\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      filename: match[2],
      code: match[3].trim()
    })
  }
  return blocks
})

// Text without code blocks
const textWithoutCode = computed(() => {
  return textContent.value.replace(/```[\s\S]*?```/g, '').trim()
})

const editDiffLines = computed((): DiffLine[] => {
  const tc = correspondingToolCall.value
  if (!tc?.diff) return []
  
  const oldLines = tc.diff.oldText.split('\n')
  const newLines = tc.diff.newText.split('\n')
  
  const result: DiffLine[] = []
  const lcs = computeLCS(oldLines, newLines)
  
  let oldIdx = 0
  let newIdx = 0
  let lcsIdx = 0
  let oldLineNum = 1
  let newLineNum = 1
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (lcsIdx < lcs.length && oldIdx < oldLines.length && newIdx < newLines.length &&
        oldLines[oldIdx] === lcs[lcsIdx] && newLines[newIdx] === lcs[lcsIdx]) {
      result.push({ type: 'context', oldLineNum: oldLineNum++, newLineNum: newLineNum++, text: oldLines[oldIdx] })
      oldIdx++
      newIdx++
      lcsIdx++
    } else if (lcsIdx < lcs.length && oldIdx < oldLines.length && oldLines[oldIdx] === lcs[lcsIdx]) {
      while (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
        result.push({ type: 'add', newLineNum: newLineNum++, text: newLines[newIdx] })
        newIdx++
      }
    } else if (lcsIdx < lcs.length && newIdx < newLines.length && newLines[newIdx] === lcs[lcsIdx]) {
      while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcs[lcsIdx]) {
        result.push({ type: 'remove', oldLineNum: oldLineNum++, text: oldLines[oldIdx] })
        oldIdx++
      }
    } else {
      while (oldIdx < oldLines.length) {
        result.push({ type: 'remove', oldLineNum: oldLineNum++, text: oldLines[oldIdx] })
        oldIdx++
      }
      while (newIdx < newLines.length) {
        result.push({ type: 'add', newLineNum: newLineNum++, text: newLines[newIdx] })
        newIdx++
      }
      break
    }
  }
  
  return result
})
</script>

<template>
  <div class="message-row" :class="{ 'user-row': isUser, 'assistant-row': isAssistant, 'tool-result-row': isToolResult }">
    <div class="message-label">
      {{ isUser ? 'You' : isAssistant ? 'Pi' : 'Tool' }}
    </div>
    <div class="message-bubble" :class="{ 'user-bubble': isUser, 'assistant-bubble': isAssistant, 'tool-result-bubble': isToolResult }">
      <!-- Thinking content (assistant only) -->
      <div v-if="thinkingContent" class="thinking-block">
        <details>
          <summary class="thinking-header">🤔 Thinking</summary>
          <div class="thinking-content">{{ thinkingContent }}</div>
        </details>
      </div>

      <!-- Text content -->
      <div v-if="textWithoutCode" class="text-content">
        <MarkdownRenderer :text="textWithoutCode" />
      </div>

      <!-- Code blocks -->
      <div v-if="codeBlocks.length > 0" class="code-blocks">
        <CodeBlock
          v-for="(block, index) in codeBlocks"
          :key="index"
          :code="block.code"
          :language="block.language"
          :filename="block.filename"
        />
      </div>

      <!-- Tool calls (assistant only) -->
      <div v-if="toolCalls.length > 0" class="tool-calls-section">
        <button class="btn toggle-tool" @click="showToolCalls = !showToolCalls">
          {{ showToolCalls ? 'Hide' : 'Show' }} Tool Calls
        </button>
        <div v-show="showToolCalls">
          <div
            v-for="tc in toolCalls"
            :key="tc.id"
            class="tool-call-item"
          >
            <div class="tool-call-header">
              <span class="tool-icon">{{ tc.name === 'edit' ? '✏️' : tc.name === 'write' ? '📝' : tc.name === 'read' ? '📖' : tc.name === 'bash' ? '💻' : '🔧' }}</span>
              <span class="tool-name">{{ tc.name }}</span>
              <span v-if="tc.diff" class="diff-badge">diff</span>
            </div>
            <!-- Edit tool diff view -->
            <div v-if="tc.diff" class="edit-diff">
              <div v-if="tc.diff.filePath" class="diff-file-path">📄 {{ tc.diff.filePath }}</div>
              <div class="diff-content">
                <div
                  v-for="(line, idx) in editDiffLines"
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
            <details v-else-if="tc.args && tc.args !== '{}'" class="tool-args-details">
              <summary>Arguments</summary>
              <pre class="tool-args">{{ tc.args }}</pre>
            </details>
          </div>
        </div>
      </div>

      <!-- Tool result message -->
      <div v-if="isToolResult" class="tool-result-wrapper">
        <div class="tool-result-header">
          <span class="tool-icon">{{ toolResultMsg.isError ? '❌' : '✅' }}</span>
          <span class="tool-name">{{ toolResultMsg.toolName }}</span>
          <span v-if="correspondingToolCall?.diff" class="diff-badge">diff</span>
        </div>
        <!-- Edit tool diff view -->
        <div v-if="correspondingToolCall?.diff" class="edit-diff">
          <div v-if="correspondingToolCall.diff.filePath" class="diff-file-path">📄 {{ correspondingToolCall.diff.filePath }}</div>
          <div class="diff-content">
            <div
              v-for="(line, idx) in editDiffLines"
              :key="idx"
              class="diff-line"
              :class="'diff-line--' + line.type"
            >
              <span class="diff-line-prefix">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}</span>
              <span class="diff-line-text">{{ line.text }}</span>
            </div>
          </div>
        </div>
        <div class="tool-result-content">
          <DiffRenderer :text="toolResultMsg.content?.[0]?.text || ''" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  animation: slideIn 0.15s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
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

.tool-result-row {
  align-items: flex-start;
  margin-left: 24px;
}

.tool-result-bubble {
  background: var(--tool-bg);
  border: 1px solid var(--border-color);
  font-size: 0.85em;
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
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

.tool-calls-section {
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
  background: var(--tool-header-bg);
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

.tool-result-wrapper {
  width: 100%;
}

.tool-result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--tool-header-bg);
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 0.9em;
}

.tool-result-content {
  padding: 8px 10px;
  overflow-x: auto;
}

.tool-result-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 0.95em;
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
</style>
