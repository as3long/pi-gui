<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '../../stores/chat'
import { piPromptWithImages } from '../../ipc/bridge'
import type { ImageContent } from '../../ipc/types'

const emit = defineEmits<{
  send: [message: string]
  abort: []
}>()

defineProps<{
  disabled?: boolean
}>()

const chatStore = useChatStore()
const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

function handleSend() {
  const text = inputText.value.trim()
  if (!text) return

  emit('send', text)
  inputText.value = ''

  // Auto-resize textarea
  if (inputRef.value) {
    inputRef.value.style.height = 'auto'
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function onInput() {
  // Auto-resize textarea
  if (inputRef.value) {
    inputRef.value.style.height = 'auto'
    inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 200) + 'px'
  }
}

function handleAbort() {
  emit('abort')
}

// Handle paste of images from clipboard
function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const images: ImageContent[] = []
  const readPromises: Promise<void>[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) continue
      const p = new Promise<void>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          images.push({ type: 'image', data: base64, mimeType: file.type })
          resolve()
        }
        reader.readAsDataURL(file)
      })
      readPromises.push(p)
    }
  }

  if (images.length === 0) return
  // Prevent default insertion of the image
  e.preventDefault()
  Promise.all(readPromises).then(() => {
    const id = `paste-${Date.now()}`
    const message = inputText.value.trim() || '(image pasted)'
    piPromptWithImages(id, message, images)
    inputText.value = ''
    // Reset textarea height after sending
    if (inputRef.value) inputRef.value.style.height = 'auto'
  })
}

function focusInput() {
  inputRef.value?.focus()
}

defineExpose({ focusInput })
</script>

<template>
  <div class="input-area">
    <!-- Queue info banner -->
    <div v-if="chatStore.pendingSteering.length > 0" class="queue-banner">
      <span class="queue-label">Steering:</span>
      <span class="queue-count">{{ chatStore.pendingSteering.length }} message(s) queued</span>
    </div>
    <div v-if="chatStore.pendingFollowUp.length > 0" class="queue-banner follow-up">
      <span class="queue-label">Follow-up:</span>
      <span class="queue-count">{{ chatStore.pendingFollowUp.length }} message(s) queued</span>
    </div>

    <div class="input-row">
      <textarea
        ref="inputRef"
        v-model="inputText"
        class="input-textarea"
        :disabled="disabled"
        placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
        rows="1"
        @keydown="handleKeydown"
        @input="onInput"
        @paste="handlePaste"
      />

      <div class="input-actions">
        <!-- Abort button (shown during streaming) -->
        <button
          v-if="chatStore.isStreaming"
          class="action-btn abort-btn"
          title="Abort current operation"
          @click="handleAbort"
        >
          ⏹
        </button>

        <!-- Send button -->
        <button
          class="action-btn send-btn"
          :disabled="disabled || !inputText.trim()"
          title="Send message"
          @click="handleSend"
        >
          ➤
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-area {
  padding: 6px 12px 8px;
  background: var(--input-bg);
}

.queue-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  margin-bottom: 6px;
  background: var(--warning-bg);
  border-radius: 5px;
  font-size: 0.75em;
}

.queue-banner.follow-up {
  background: var(--info-bg);
}

.queue-label {
  font-weight: 600;
  color: var(--text-color);
}

.queue-count {
  color: var(--muted-color);
}

.input-row {
  display: flex;
  gap: 6px;
  align-items: center;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 6px;
  transition: border-color 0.2s;
}

.input-row:focus-within {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.input-textarea {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.4;
  resize: none;
  outline: none;
  max-height: 150px;
  padding: 4px;
  box-sizing: border-box;
}

.input-textarea::placeholder {
  color: var(--muted-color);
}

.input-textarea:disabled {
  opacity: 0.5;
}

.input-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.15s, opacity 0.15s;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn {
  background: var(--accent-color);
  color: white;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.abort-btn {
  background: var(--error-bg);
  color: var(--error-color);
}

.abort-btn:hover {
  background: var(--error-color);
  color: white;
}
</style>
