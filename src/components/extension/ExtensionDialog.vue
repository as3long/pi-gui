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

// When request changes, reset local state
watch(request, (newReq) => {
  if (!newReq) return
  selectedOption.value = newReq.options?.[0] || ''
  inputValue.value = newReq.placeholder || ''
  editorValue.value = newReq.prefill || ''
})

// Auto‑focus first input element when dialog appears
onMounted(() => {
  // Nothing - handled via refs if needed
})

const isSelect = computed(() => request.value?.method === 'select')
const isConfirm = computed(() => request.value?.method === 'confirm')
const isInput = computed(() => request.value?.method === 'input')
const isEditor = computed(() => request.value?.method === 'editor')
</script>

<template>
  <div v-if="request" class="overlay">
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
</style>
