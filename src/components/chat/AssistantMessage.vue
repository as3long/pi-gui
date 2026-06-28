<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AssistantMessage } from '../../ipc/types'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import CodeBlock from '../common/CodeBlock.vue'
import ToolCallView from './ToolCallView.vue'
import { extractCodeBlocks, getTextWithoutCodeBlocks } from './utils'

const props = defineProps<{
  message: AssistantMessage
}>()

const showToolCalls = ref(true)

const textContent = computed(() => {
  return props.message.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
})

const thinkingContent = computed(() => {
  return props.message.content
    .filter((c): c is { type: 'thinking'; thinking: string } => c.type === 'thinking')
    .map((c) => c.thinking)
    .join('\n')
})

const toolCalls = computed(() => {
  return props.message.content
    .filter((c): c is { type: 'toolCall'; id: string; name: string; arguments: any } => c.type === 'toolCall')
    .map((c) => ({
      id: c.id,
      name: c.name,
      args: JSON.stringify(c.arguments, null, 2),
    }))
})

const codeBlocks = computed(() => extractCodeBlocks(textContent.value))
const textWithoutCode = computed(() => getTextWithoutCodeBlocks(textContent.value))
</script>

<template>
  <div class="message-row assistant-row">
    <div class="message-label">Pi</div>
    <div class="message-bubble assistant-bubble">
      <!-- Thinking content -->
      <details v-if="thinkingContent" class="thinking-details">
        <summary>💭 Thinking...</summary>
        <div class="thinking-content">
          <MarkdownRenderer :text="thinkingContent" />
        </div>
      </details>

      <!-- Text content with embedded code blocks -->
      <div v-if="textContent" class="text-content">
        <MarkdownRenderer :text="textWithoutCode" />
        <div v-for="(block, idx) in codeBlocks" :key="idx" class="code-block-wrapper">
          <CodeBlock :code="block.code" :language="block.language" :filename="block.filename" />
        </div>
      </div>

      <!-- Tool calls -->
      <div v-if="toolCalls.length > 0" class="tool-calls">
        <div class="tool-calls-header" @click="showToolCalls = !showToolCalls">
          <span>🔧 {{ toolCalls.length }} tool call(s)</span>
          <span class="toggle-icon">{{ showToolCalls ? '▼' : '▶' }}</span>
        </div>
        <div v-if="showToolCalls" class="tool-calls-list">
          <ToolCallView
            v-for="tc in toolCalls"
            :key="tc.id"
            :name="tc.name"
            :args="tc.args"
            :is-complete="true"
          />
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
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

.assistant-row {
  align-items: flex-start;
}

.assistant-bubble {
  background: var(--assistant-bg);
}

.thinking-details {
  margin-bottom: 8px;
  padding: 8px;
  background: var(--thinking-bg);
  border-radius: 6px;
}

.thinking-details summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--muted-color);
  user-select: none;
}

.thinking-content {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted-color);
  opacity: 0.8;
}

.text-content {
  white-space: pre-wrap;
}

.code-block-wrapper {
  margin: 8px 0;
}

.tool-calls {
  margin-top: 8px;
}

.tool-calls-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--tool-header-bg);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}

.tool-calls-header:hover {
  background: var(--hover-bg);
}

.toggle-icon {
  font-size: 10px;
  color: var(--muted-color);
}

.tool-calls-list {
  margin-top: 4px;
}
</style>
