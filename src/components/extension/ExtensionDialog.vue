<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useUiStore } from '../../stores/ui'
import { piExtensionUiResponse } from '../../ipc/bridge'

const uiStore = useUiStore()
const request = computed(() => uiStore.request)

// Local UI state for each dialog type
const selectedOption = ref<string>('')
const inputValue = ref<string>('')
const editorValue = ref<string>('')

// Notify state
const notifyVisible = ref(false)
let notifyTimer: ReturnType<typeof setTimeout> | null = null

// Close the dialog (calls respond with undefined)
function cancel() {
  if (request.value) {
    piExtensionUiResponse(request.value.id, undefined, undefined, true)
    uiStore.cancel()
  }
}

// Confirm for select/confirm/input/editor
function confirmSelect() {
  piExtensionUiResponse(request.value?.id || '', selectedOption.value)
  uiStore.respond(selectedOption.value)
}

function confirmInput() {
  piExtensionUiResponse(request.value?.id || '', inputValue.value)
  uiStore.respond(inputValue.value)
}

function confirmEditor() {
  piExtensionUiResponse(request.value?.id || '', editorValue.value)
  uiStore.respond(editorValue.value)
}

function confirmConfirm() {
  // Confirm dialog OK pressed
  piExtensionUiResponse(request.value?.id || '', undefined, true)
  uiStore.respond(true)
}



// Auto‑focus first input element when dialog appears
onMounted(() => {
  // Nothing - handled via refs if needed
})

const isSelect = computed(() => request.value?.method === 'select')
const isConfirm = computed(() => request.value?.method === 'confirm')
const isInput = computed(() => request.value?.method === 'input')
const isEditor = computed(() => request.value?.method === 'editor')
const isNotify = computed(() => request.value?.method === 'notify')

// Handle notify auto-dismiss
watch(request, (newReq) => {
  if (!newReq) return
  
  // Reset local state for other types
  selectedOption.value = newReq.options?.[0] || ''
  inputValue.value = newReq.placeholder || ''
  editorValue.value = newReq.prefill || ''
  
  // Handle notify type
  if (newReq.method === 'notify') {
    notifyVisible.value = true
    // Clear previous timer
    if (notifyTimer) {
      clearTimeout(notifyTimer)
    }
    // Auto dismiss after 8 seconds
    notifyTimer = setTimeout(() => {
      dismissNotify()
    }, 8000)
  }
})

function dismissNotify() {
  if (request.value?.method === 'notify') {
    piExtensionUiResponse(request.value.id)
    uiStore.respond(undefined)
  }
  notifyVisible.value = false
  if (notifyTimer) {
    clearTimeout(notifyTimer)
    notifyTimer = null
  }
}
</script>

<template>
  <!-- Notify Toast (right top, no overlay) -->
  <Transition name="notify-fade">
    <div v-if="isNotify && notifyVisible" class="notify-toast">
      <div class="notify-content">
        <span v-if="request.title" class="notify-title">{{ request.title }}</span>
        <span v-if="request.message" class="notify-message">{{ request.message }}</span>
      </div>
      <button class="notify-close" @click="dismissNotify">✕</button>
    </div>
  </Transition>

  <!-- Other Dialog Types (with overlay) -->
  <div v-if="request && !isNotify" class="overlay">
    <div class="dialog">
      <!-- Title -->
      <h3 class="dialog-title">{{ request.title || 'Prompt' }}</h3>
      <p v-if="request.message" class="dialog-message">{{ request.message }}</p>

      <!-- Select Dialog -->
      <div v-if="isSelect" class="select-dialog">
        <select v-model="selectedOption" class="select-input">
          <option v-for="opt in request.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <div class="dialog-actions">
          <button class="btn" @click="cancel">Cancel</button>
          <button class="btn btn-primary" @click="confirmSelect">OK</button>
        </div>
      </div>

      <!-- Confirm Dialog -->
      <div v-else-if="isConfirm" class="confirm-dialog">
        <div class="dialog-actions">
          <button class="btn" @click="cancel">Cancel</button>
          <button class="btn btn-primary" @click="confirmConfirm">OK</button>
        </div>
      </div>

      <!-- Input Dialog -->
      <div v-else-if="isInput" class="input-dialog">
        <input v-model="inputValue" class="text-input" :placeholder="request.placeholder" />
        <div class="dialog-actions">
          <button class="btn" @click="cancel">Cancel</button>
          <button class="btn btn-primary" @click="confirmInput">OK</button>
        </div>
      </div>

      <!-- Editor Dialog (multiline) -->
      <div v-else-if="isEditor" class="editor-dialog">
        <textarea v-model="editorValue" class="textarea-input" rows="6" />
        <div class="dialog-actions">
          <button class="btn" @click="cancel">Cancel</button>
          <button class="btn btn-primary" @click="confirmEditor">OK</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  min-width: 280px;
  max-width: 80vw;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  margin: 0 0 8px;
  font-size: 1.05em;
  color: var(--text-color);
}

.dialog-message {
  margin-bottom: 12px;
  font-size: 0.9em;
  color: var(--muted-color);
}

.select-input,
.text-input,
.textarea-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.9em;
  box-sizing: border-box;
}

.select-input:focus,
.text-input:focus,
.textarea-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.85em;
}

.btn-primary {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.btn:hover {
  background: var(--hover-bg);
}

/* Notify Toast */
.notify-toast {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 240px;
  max-width: 400px;
}

.notify-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notify-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-color);
}

.notify-message {
  font-size: 0.85em;
  color: var(--muted-color);
  line-height: 1.4;
}

.notify-close {
  background: none;
  border: none;
  color: var(--muted-color);
  cursor: pointer;
  padding: 2px 4px;
  font-size: 0.9em;
  line-height: 1;
  border-radius: 4px;
}

.notify-close:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

/* Notify Transition */
.notify-fade-enter-active,
.notify-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.notify-fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.notify-fade-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
