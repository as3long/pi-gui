<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  provider: string
  isConfigured: boolean
  providerInfo?: { name: string; desc?: string }
  isLoading: boolean
}>()

const emit = defineEmits<{
  save: [key: string, type: string]
  delete: []
}>()

const apiKeyInput = ref('')
const authType = ref('api_key')

// Watch for provider changes to reset form
watch(() => props.provider, () => {
  apiKeyInput.value = ''
  authType.value = 'api_key'
})

const canSave = computed(() => apiKeyInput.value.trim().length > 0)
</script>

<template>
  <div class="api-key-form">
    <h3 class="section-title">
      {{ isConfigured ? 'Update' : 'Add' }} API Key
    </h3>
    <div class="provider-name">{{ providerInfo?.name || provider }}</div>

    <div class="form-group">
      <label class="form-label">Key Type</label>
      <select v-model="authType" class="form-input">
        <option value="api_key">API Key</option>
        <option value="bearer">Bearer Token</option>
        <option value="basic">Basic Auth</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">API Key</label>
      <input
        v-model="apiKeyInput"
        class="form-input mono"
        type="password"
        placeholder="Enter your API key..."
        @keyup.enter="canSave && emit('save', apiKeyInput, authType)"
      />
    </div>

    <!-- Volcengine hint -->
    <div v-if="provider === 'volcengine'" class="provider-hint">
      <p>📌 <strong>火山引擎</strong> 配置说明：</p>
      <ul>
        <li>API Key: 在火山引擎控制台获取</li>
        <li>模型 ID 使用 endpoint ID (ep-xxxxx)</li>
        <li>Base URL: <code>https://ark.cn-beijing.volces.com/api/v3</code></li>
      </ul>
    </div>

    <div class="btn-row">
      <button
        class="btn btn-primary"
        :disabled="isLoading || !canSave"
        @click="emit('save', apiKeyInput, authType)"
      >
        💾 Save Key
      </button>
      <button
        v-if="isConfigured"
        class="btn btn-danger"
        :disabled="isLoading"
        @click="emit('delete')"
      >
        🗑️ Delete
      </button>
    </div>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.provider-name {
  margin-bottom: 16px;
  padding: 8px 12px;
  background: var(--badge-bg);
  border-radius: 6px;
  font-size: 0.9em;
  color: var(--accent-color);
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 0.85em;
  color: var(--muted-color);
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9em;
  box-sizing: border-box;
}

.form-input.mono {
  font-family: 'SF Mono', monospace;
}

.form-input:focus {
  border-color: var(--accent-color);
  outline: none;
}

.provider-hint {
  margin: 12px 0;
  padding: 12px;
  background: var(--badge-bg);
  border-radius: 6px;
  font-size: 0.85em;
  color: var(--muted-color);
}

.provider-hint p {
  margin: 0 0 8px;
}

.provider-hint ul {
  margin: 0;
  padding-left: 20px;
}

.provider-hint code {
  padding: 2px 6px;
  background: var(--code-bg);
  border-radius: 4px;
  font-size: 0.9em;
}

.btn-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-danger {
  background: transparent;
  color: var(--error-color);
  border-color: var(--error-color);
}

.btn-danger:hover:not(:disabled) {
  background: var(--error-bg);
}
</style>
