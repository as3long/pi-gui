<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useSessionStore } from '../../stores/session'
import { piSetModel, piGetAvailableModels, piSetThinkingLevel } from '../../ipc/bridge'

const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()

const providerInput = ref(settingsStore.provider)
const modelInput = ref(settingsStore.modelId)

const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

async function applyModel() {
  if (!providerInput.value || !modelInput.value) return
  settingsStore.setProvider(providerInput.value)
  settingsStore.setModelId(modelInput.value)
  await piSetModel(providerInput.value, modelInput.value)
}

async function refreshModels() {
  await piGetAvailableModels()
}

async function changeThinkingLevel(level: string) {
  settingsStore.setThinkingLevel(level as any)
  await piSetThinkingLevel(level)
}
</script>

<template>
  <div class="model-selector">
    <h3 class="section-title">Model</h3>

    <div class="current-model" v-if="sessionStore.currentModel">
      <span class="current-label">Active:</span>
      <span class="current-value">{{ sessionStore.currentModel.provider }} / {{ sessionStore.currentModel.name }}</span>
    </div>

    <div class="form-group">
      <label class="form-label">Provider</label>
      <input
        v-model="providerInput"
        class="form-input"
        placeholder="e.g., anthropic, openai"
        @change="applyModel"
      />
    </div>

    <div class="form-group">
      <label class="form-label">Model ID</label>
      <input
        v-model="modelInput"
        class="form-input"
        placeholder="e.g., claude-sonnet-4-20250514"
        @change="applyModel"
      />
    </div>

    <div class="button-row">
      <button class="btn btn-primary" @click="applyModel">Apply Model</button>
      <button class="btn btn-secondary" @click="refreshModels">Refresh List</button>
    </div>

    <h3 class="section-title thinking-title">Thinking Level</h3>
    <div class="thinking-buttons">
      <button
        v-for="level in thinkingLevels"
        :key="level"
        class="btn thinking-btn"
        :class="{ active: settingsStore.thinkingLevel === level }"
        @click="changeThinkingLevel(level)"
      >
        {{ level }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.model-selector {
  padding: 16px;
}

.section-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.thinking-title {
  margin-top: 20px;
}

.current-model {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--badge-bg);
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 0.85em;
}

.current-label {
  color: var(--muted-color);
}

.current-value {
  color: var(--accent-color);
  font-weight: 500;
  font-family: 'SF Mono', monospace;
}

.form-group {
  margin-bottom: 10px;
}

.form-label {
  display: block;
  font-size: 0.8em;
  color: var(--muted-color);
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9em;
  font-family: 'SF Mono', monospace;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--accent-color);
  outline: none;
}

.button-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8em;
  background: var(--bg-color);
  color: var(--text-color);
  transition: all 0.15s;
}

.btn:hover {
  border-color: var(--accent-color);
}

.btn-primary {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--input-bg);
}

.thinking-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.thinking-btn {
  font-size: 0.75em;
  text-transform: uppercase;
  padding: 4px 8px;
}

.thinking-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}
</style>
