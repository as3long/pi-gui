<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentMessage, AssistantMessage, UserMessage, ToolResultMessage } from '../../ipc/types'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import DiffRenderer from '../common/DiffRenderer.vue'
import CodeBlock from '../common/CodeBlock.vue'

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

const toolCalls = computed(() => {
  if (!isAssistant.value) return []
  return assistantMsg.value.content.filter(c => c.type === 'toolCall').map(c => ({
    id: (c as { id: string }).id,
    name: (c as { name: string }).name,
    args: JSON.stringify((c as { arguments: Record<string, unknown> }).arguments, null, 2),
  }))
})

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
              <span class="tool-icon">🔧</span>
              <span class="tool-name">{{ tc.name }}</span>
            </div>
            <details v-if="tc.args && tc.args !== '{}'" class="tool-args-details">
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
</style>
