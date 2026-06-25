<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useChatStore } from '../../stores/chat'
import MessageItem from './MessageItem.vue'

const chatStore = useChatStore()
const messageListRef = ref<HTMLDivElement | null>(null)

// Auto-scroll to bottom on new messages or streaming updates
watch(
  () => [
    chatStore.messages.length,
    chatStore.streamingMessage.text,
    chatStore.streamingMessage.thinking,
  ],
  async () => {
    await nextTick()
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  },
  { deep: true }
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
                <span class="tool-icon">🔧</span>
                <span class="tool-name">{{ tc.name }}</span>
                <span v-if="tc.isComplete" class="tool-status done">✓</span>
                <span v-else class="tool-status running">⋯</span>
              </div>
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
  padding: 16px;
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
  margin-bottom: 12px;
}

.message-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  line-height: 1.5;
  font-size: 0.95em;
}

.assistant-row {
  justify-content: flex-start;
}

.assistant-bubble {
  background: var(--assistant-bg);
  border: 1px solid var(--border-color);
  border-top-left-radius: 4px;
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
  white-space: pre-wrap;
  word-wrap: break-word;
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
  font-family: 'SF Mono', monospace;
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
</style>
