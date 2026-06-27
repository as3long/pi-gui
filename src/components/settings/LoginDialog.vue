<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { piGetAgentAuth, piSetAgentAuth, piGetAgentSettings, piListPackages, piInstallPackage } from '../../ipc/bridge'
import { notifySuccess, notifyError } from '../../utils/notify'

const emit = defineEmits<{ close: [] }>()

const isLoading = ref(false)
const selectedProvider = ref('')
const apiKeyInput = ref('')
const authType = ref('api_key')
const providerSearch = ref('')

const authData = ref<Record<string, { type: string; key: string }>>({})
const agentSettings = ref<Record<string, unknown>>({})
const installedPackages = ref<string[]>([])
const isInstalling = ref(false)

const knownProviders = [
  'openai', 'anthropic', 'google', 'mistral', 'deepseek', 'xai',
  'groq', 'cohere', 'together', 'fireworks', 'replicate',
  'azure_openai', 'bedrock', 'vertex', 'openrouter', 'volcengine', 'custom',
]

// Display names and descriptions for providers
const providerInfo: Record<string, { name: string; desc?: string }> = {
  volcengine: { name: 'Volcengine (火山引擎)', desc: 'ByteDance AI - 豆包大模型' },
}

const filteredProviders = computed(() => {
  const q = providerSearch.value.toLowerCase()
  if (!q) return knownProviders
  return knownProviders.filter(p => p.includes(q) || p.startsWith(q))
})

const existingProviders = computed(() => Object.keys(authData.value))

async function loadConfig() {
  isLoading.value = true
  try {
    const [auth, settings, packages] = await Promise.all([
      piGetAgentAuth(),
      piGetAgentSettings(),
      piListPackages(),
    ])
    authData.value = auth
    agentSettings.value = settings as Record<string, unknown>
    installedPackages.value = packages
  } catch (e) {
    console.error('Failed to load config:', e)
  } finally {
    isLoading.value = false
  }
}

async function installVolcengineProvider() {
  if (isInstalling.value) return
  isInstalling.value = true
  try {
    await piInstallPackage('npm:pi-volcengine-provider')
    // Refresh package list after installation
    installedPackages.value = await piListPackages()
    notifySuccess('pi-volcengine-provider installed successfully!')
  } catch (e) {
    console.error('Failed to install pi-volcengine-provider:', e)
    notifyError(`Failed to install: ${e}`)
  } finally {
    isInstalling.value = false
  }
}

function isVolcengineProviderInstalled(): boolean {
  return installedPackages.value.some(p => 
    p.includes('volcengine') || p.includes('pi-volcengine-provider')
  )
}

async function saveAuth() {
  if (!selectedProvider.value || !apiKeyInput.value.trim()) return
  isLoading.value = true
  try {
    const newAuth = { ...authData.value, [selectedProvider.value]: { type: authType.value, key: apiKeyInput.value.trim() } }
    await piSetAgentAuth(newAuth)
    authData.value = newAuth
    apiKeyInput.value = ''
    notifySuccess('API key saved successfully!')
  } catch (e) {
    console.error('Failed to save auth:', e)
    notifyError(`Failed to save: ${e}`)
  } finally {
    isLoading.value = false
  }
}

async function deleteAuth(provider: string) {
  if (!confirm(`Delete API key for ${provider}?`)) return
  isLoading.value = true
  try {
    const newAuth = { ...authData.value }
    delete newAuth[provider]
    await piSetAgentAuth(newAuth)
    authData.value = newAuth
    if (selectedProvider.value === provider) {
      selectedProvider.value = ''
      apiKeyInput.value = ''
    }
  } catch (e) {
    console.error('Failed to delete auth:', e)
    notifyError(`Failed to delete: ${e}`)
  } finally {
    isLoading.value = false
  }
}

function selectProvider(provider: string) {
  selectedProvider.value = provider
  const existing = authData.value[provider]
  if (existing) {
    apiKeyInput.value = existing.key
    authType.value = existing.type
  } else {
    apiKeyInput.value = ''
    authType.value = 'api_key'
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="login-overlay" @click.self="emit('close')">
    <div class="login-dialog">
      <div class="dialog-header">
        <h2 class="dialog-title">🔑 API Key Configuration</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="dialog-body">
        <!-- Provider List -->
        <div class="section">
          <h3 class="section-title">Provider</h3>
          <input
            v-model="providerSearch"
            class="form-input"
            placeholder="Search providers..."
          />
          <div class="provider-grid">
            <button
              v-for="provider in filteredProviders"
              :key="provider"
              class="provider-btn"
              :class="{ active: selectedProvider === provider, configured: existingProviders.includes(provider) }"
              @click="selectProvider(provider)"
            >
              {{ providerInfo[provider]?.name || provider }}
              <span v-if="providerInfo[provider]?.desc" class="provider-desc">{{ providerInfo[provider].desc }}</span>
              <span v-if="existingProviders.includes(provider)" class="check">✓</span>
            </button>
          </div>
        </div>

        <!-- API Key Input -->
        <div v-if="selectedProvider" class="section">
          <h3 class="section-title">
            {{ existingProviders.includes(selectedProvider) ? 'Update' : 'Add' }} API Key
          </h3>
          <div class="provider-name">{{ providerInfo[selectedProvider]?.name || selectedProvider }}</div>

          <!-- Volcengine provider installation check -->
          <div v-if="selectedProvider === 'volcengine' && !isVolcengineProviderInstalled()" class="provider-hint warning">
            <p>⚠️ <strong>pi-volcengine-provider 未安装</strong></p>
            <p>为了使用火山引擎，请先安装 provider 包：</p>
            <button
              class="btn btn-primary install-btn"
              @click="installVolcengineProvider"
              :disabled="isInstalling"
            >
              {{ isInstalling ? '⏳ 安装中...' : '📦 安装 pi-volcengine-provider' }}
            </button>
          </div>

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
              @keyup.enter="saveAuth"
            />
          </div>

          <!-- Volcengine hint -->
          <div v-if="selectedProvider === 'volcengine'" class="provider-hint">
            <p>📌 <strong>火山引擎</strong> 配置说明：</p>
            <ul>
              <li>API Key: 在火山引擎控制台获取</li>
              <li>模型 ID 使用 endpoint ID (ep-xxxxx)</li>
              <li>Base URL: <code>https://ark.cn-beijing.volces.com/api/v3</code></li>
            </ul>
          </div>

          <div class="btn-row">
            <button class="btn btn-primary" @click="saveAuth" :disabled="isLoading || !apiKeyInput.trim()">
              💾 Save Key
            </button>
            <button
              v-if="existingProviders.includes(selectedProvider)"
              class="btn btn-danger"
              @click="deleteAuth(selectedProvider)"
              :disabled="isLoading"
            >
              🗑️ Delete
            </button>
          </div>
        </div>

        <!-- Configured Keys List -->
        <div v-if="existingProviders.length > 0" class="section">
          <h3 class="section-title">Configured Keys ({{ existingProviders.length }})</h3>
          <div class="auth-list">
            <div v-for="provider in existingProviders" :key="provider" class="auth-item">
              <div class="auth-info">
                <span class="auth-provider">{{ provider }}</span>
                <span class="auth-type">{{ authData[provider].type }}</span>
              </div>
              <div class="auth-actions">
                <button class="btn btn-sm" @click="selectProvider(provider)">Edit</button>
                <button class="btn btn-sm btn-danger" @click="deleteAuth(provider)">Delete</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="existingProviders.length === 0 && !selectedProvider" class="empty-hint">
          No API keys configured. Select a provider above to add one.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
}

.login-dialog {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  width: min(520px, 95vw);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.dialog-title {
  margin: 0;
  font-size: 1.1em;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: var(--muted-color);
  font-size: 1.2em;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px;
  margin-top: 8px;
}

.provider-btn {
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.8em;
  text-transform: capitalize;
  transition: all 0.15s;
  position: relative;
}

.provider-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.provider-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.provider-btn.configured {
  border-color: var(--success-color);
}

.provider-desc {
  display: block;
  font-size: 0.65em;
  color: var(--muted-color);
  margin-top: 2px;
  line-height: 1.2;
}

.provider-btn.active .provider-desc {
  color: rgba(255, 255, 255, 0.8);
}

.check {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 0.7em;
  color: var(--success-color);
}

.provider-name {
  font-size: 0.9em;
  font-weight: 500;
  color: var(--accent-color);
  margin-bottom: 12px;
  text-transform: capitalize;
}

.form-group {
  margin-bottom: 12px;
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
  box-sizing: border-box;
}

.form-input.mono {
  font-family: 'SF Mono', monospace;
}

.form-input:focus {
  border-color: var(--accent-color);
  outline: none;
}

select.form-input {
  cursor: pointer;
}

.btn-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.provider-hint {
  margin-top: 12px;
  padding: 12px;
  background: var(--badge-bg);
  border-radius: 6px;
  border-left: 3px solid var(--accent-color);
  font-size: 0.85em;
  line-height: 1.6;
}

.provider-hint.warning {
  border-left-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.provider-hint p {
  margin: 0 0 8px;
  color: var(--text-color);
}

.provider-hint ul {
  margin: 0;
  padding-left: 20px;
}

.provider-hint li {
  color: var(--muted-color);
  margin-bottom: 4px;
}

.provider-hint code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', monospace;
  font-size: 0.9em;
  color: var(--accent-color);
}

.install-btn {
  width: 100%;
  margin-top: 8px;
  justify-content: center;
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
  background: var(--error-bg);
  color: var(--error-color);
  border-color: var(--error-color);
}

.btn-danger:hover:not(:disabled) {
  opacity: 0.8;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 0.8em;
}

.auth-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--badge-bg);
  border-radius: 6px;
}

.auth-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auth-provider {
  font-weight: 500;
  color: var(--text-color);
  text-transform: capitalize;
}

.auth-type {
  font-size: 0.75em;
  padding: 2px 6px;
  background: var(--hover-bg);
  border-radius: 4px;
  color: var(--muted-color);
}

.auth-actions {
  display: flex;
  gap: 6px;
}

.empty-hint {
  padding: 24px;
  text-align: center;
  color: var(--muted-color);
  font-size: 0.85em;
}
</style>
