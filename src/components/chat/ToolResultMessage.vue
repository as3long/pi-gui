<script setup lang="ts">
import { computed } from 'vue'
import type { ToolResultMessage, AssistantMessage } from '../../ipc/types'
import DiffRenderer from '../common/DiffRenderer.vue'
import CodeEditor from '../editor/CodeEditor.vue'
import { useChatStore } from '../../stores/chat'

const chatStore = useChatStore()

const props = defineProps<{
  message: ToolResultMessage
}>()

// Detect file extension for language
function getLanguageFromPath(filePath: string): 'javascript' | 'typescript' | 'python' | 'html' | 'css' {
  if (!filePath) return 'javascript'
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, 'javascript' | 'typescript' | 'python' | 'html' | 'css'> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'vue': 'html',
  }
  return langMap[ext] || 'javascript'
}

// Find corresponding tool call
const correspondingToolCall = computed(() => {
  const resultMsg = props.message
  const msgIndex = chatStore.messages.indexOf(props.message)

  // Search backwards through all messages to find the matching tool call
  for (let i = msgIndex - 1; i >= 0; i--) {
    const msg = chatStore.messages[i]
    if (msg.role === 'assistant') {
      const assistantMsg = msg as AssistantMessage
      const tc = assistantMsg.content.find(
        (c) => c.type === 'toolCall' && (c as any).id === resultMsg.toolCallId
      )
      if (tc) {
        const name = (tc as any).name
        return {
          name,
          isRead: name === 'read',
          filePath: ((tc as any).arguments?.path || (tc as any).arguments?.filePath) ? String((tc as any).arguments?.path || (tc as any).arguments?.filePath) : undefined,
        }
      }
    }
  }
  return null
})

// Get content for read tool
const readContent = computed(() => {
  if (!correspondingToolCall.value?.isRead) return ''
  return props.message.content?.[0]?.text || ''
})

// Get language for read tool
const readLanguage = computed(() => {
  return getLanguageFromPath(correspondingToolCall.value?.filePath || '')
})
</script>

<template>
  <div class="message-row tool-result-row">
    <div class="tool-result-wrapper">
      <div class="tool-result-header">
        <span class="tool-icon">{{ message.isError ? '❌' : '✅' }}</span>
        <span class="tool-name">{{ message.toolName }}</span>
      </div>
      <!-- Read tool code view -->
      <div v-if="correspondingToolCall?.isRead" class="read-code-view">
        <div class="file-path-header">
          <span class="file-icon">📄</span>
          <span class="file-path">{{ correspondingToolCall.filePath }}</span>
        </div>
        <CodeEditor
          :model-value="readContent"
          :language="readLanguage"
          :read-only="true"
          class="read-editor"
        />
      </div>
      <!-- Default view -->
      <div v-else class="tool-result-content" :class="{ 'edit-result': message.toolName === 'edit' }">
        <DiffRenderer :text="message.content?.[0]?.text || ''" />
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

.tool-result-row {
  align-items: flex-start;
}

.tool-result-wrapper {
  width: min(720px, 100%);
  padding: 8px 12px;
  background: var(--tool-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 13px;
}

.tool-result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 12px;
}

.tool-icon {
  font-size: 14px;
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

.edit-diff {
  margin-bottom: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
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
  font-family: 'SF Mono', monospace;
  font-size: 12px;
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

.tool-result-content {
  font-size: 12px;
  color: var(--text-color);
}

.tool-result-content.edit-result {
  color: #2ea043;
  font-weight: 500;
}

.read-code-view {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.file-path-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
}

.file-icon {
  font-size: 12px;
}

.file-path {
  color: var(--muted-color);
  font-family: 'SF Mono', monospace;
}

.read-editor {
  max-height: 500px;
  overflow-y: auto;
}
</style>
