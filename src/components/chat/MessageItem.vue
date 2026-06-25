<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentMessage, AssistantMessage, UserMessage, ToolResultMessage } from '../../ipc/types'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import DiffRenderer from '../common/DiffRenderer.vue'

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
      <div v-if="textContent" class="text-content">
        <MarkdownRenderer :text="textContent" />
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
  margin-bottom: 12px;
  animation: slideIn 0.15s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-label {
  font-size: 0.8em;
  font-weight: 600;
  color: var(--muted-color);
  margin-bottom: 4px;
  padding: 0 4px;
}

.message-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  line-height: 1.5;
  font-size: 0.95em;
}

.user-row {
  align-items: flex-end;
}

.user-bubble {
  background: var(--user-bg);
  border: 1px solid var(--user-border);
  border-bottom-right-radius: 4px;
}

.assistant-row {
  align-items: flex-start;
}

.assistant-bubble {
  background: var(--assistant-bg);
  border: 1px solid var(--border-color);
  border-top-left-radius: 4px;
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
  white-space: pre-wrap;
  word-wrap: break-word;
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
  font-family: 'SF Mono', monospace;
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
  font-family: 'SF Mono', monospace;
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
