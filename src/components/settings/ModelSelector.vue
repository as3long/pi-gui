<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { piSetModel, piGetAvailableModels, piSetThinkingLevel, piGetState } from '../../ipc/bridge'
import { usePureMVC, ModelProxy } from '../../mvc'

const { facade } = usePureMVC()
const modelProxy = facade.retrieveProxy(ModelProxy.NAME) as ModelProxy

const providerInput = ref(modelProxy.provider)
const modelInput = ref(modelProxy.modelId)
const isRefreshing = ref(false)

const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

// Common providers
const commonProviders = [
  'anthropic', 'openai', 'google', 'deepseek', 'volcengine', 'xai', 'qwen', 'ollama', 'azure', 'groq'
] as const

// Common models per provider
const providerModels: Record<string, string[]> = {
  anthropic: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini', 'o1'],
  google: ['gemini-2.5-pro-preview-05-14', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  volcengine: ['ark-code-seed', 'doubao-pro-32k', 'doubao-lite-32k'],
  xai: ['grok-2', 'grok-2-1212'],
  qwen: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
  ollama: ['llama3', 'codellama', 'mistral'],
  azure: ['gpt-4o', 'gpt-4-turbo'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
}

// Get available models for selected provider
const availableModels = computed((): string[] => {
  const provider = providerInput.value
  if (!provider || provider === 'custom') return []

  // First try from proxy's available models
  const modelsFromProxy = modelProxy.availableModels
    .filter(m => m.provider === provider)
    .map(m => m.id || m.name)
  if (modelsFromProxy.length > 0) return modelsFromProxy

  // Fallback to predefined models
  return (providerModels as Record<string, string[]>)[provider] || []
})

const availableProviders = computed(() => {
  if (modelProxy.availableModels.length > 0) {
    const providers = new Set(modelProxy.availableModels.map(m => m.provider))
    return Array.from(providers).sort()
  }
  return [...commonProviders]
})

onMounted(() => {
  // Sync initial state
  providerInput.value = modelProxy.provider
  modelInput.value = modelProxy.modelId
})

// When provider changes, auto-select first model from list
watch(providerInput, (newProvider) => {
  if (newProvider && newProvider !== 'custom') {
    const models = availableModels.value
    if (models.length > 0 && !models.includes(modelInput.value)) {
      modelInput.value = models[0]
    }
  }
})

async function applyModel() {
  const provider = providerInput.value === 'custom' ? '' : providerInput.value
  if (!provider || !modelInput.value) return

  modelProxy.setProvider(provider)
  modelProxy.setModelId(modelInput.value)
  await piSetModel(provider, modelInput.value)
  await piGetState()
}

async function refreshModels() {
  isRefreshing.value = true
  try {
    const models = await Promise.race([
      piGetAvailableModels(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
    ]) as any[]
    modelProxy.setAvailableModels(models)
  } catch (e) {
    console.error('[ModelSelector] Failed to refresh models:', e)
  } finally {
    isRefreshing.value = false
  }
}

async function changeThinkingLevel(level: string) {
  modelProxy.setThinkingLevel(level)
  await piSetThinkingLevel(level)
}
</script>

<template>
  <div class="model-selector">
    <h3 class="section-title">Model</h3>

    <div class="current-model" v-if="modelProxy.currentModel">
      <span class="current-label">Active:</span>
      <span class="current-value">{{ modelProxy.currentModel.provider }} / {{ modelProxy.currentModel.name }}</span>
    </div>

    <div class="form-group">
      <label class="form-label">Provider</label>
      <select
        v-model="providerInput"
        class="form-select"
        @change="applyModel"
      >
        <option value="">Select provider...</option>
        <option v-for="provider in availableProviders" :key="provider" :value="provider">
          {{ provider }}
        </option>
        <option value="custom">Custom...</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">Model ID</label>
      <select
        v-if="providerInput && providerInput !== 'custom' && availableModels.length > 0"
        v-model="modelInput"
        class="form-select"
        @change="applyModel"
      >
        <option value="">Select model...</option>
        <option v-for="model in availableModels" :key="model" :value="model">
          {{ model }}
        </option>
      </select>
      <input
        v-model="modelInput"
        class="form-input"
        :placeholder="availableModels.length > 0 ? 'Or enter custom model...' : 'e.g., claude-sonnet-4-20250514'"
        @change="applyModel"
      />
    </div>

    <div class="button-row">
      <button class="btn btn-primary" @click="applyModel">Apply Model</button>
      <button
        class="btn btn-secondary"
        :class="{ loading: isRefreshing }"
        :disabled="isRefreshing"
        @click="refreshModels"
      >
        {{ isRefreshing ? '⏳ Loading...' : 'Refresh List' }}
      </button>
    </div>

    <h3 class="section-title thinking-title">Thinking Level</h3>
    <div class="thinking-buttons">
      <button
        v-for="level in thinkingLevels"
        :key="level"
        class="btn thinking-btn"
        :class="{ active: modelProxy.thinkingLevel === level }"
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

.form-select,
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

.form-select:focus,
.form-input:focus {
  border-color: var(--accent-color);
  outline: none;
}

.form-select option {
  background: var(--bg-color);
  color: var(--text-color);
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

.btn.loading {
  opacity: 0.6;
  cursor: wait;
}

.btn:disabled {
  pointer-events: none;
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
