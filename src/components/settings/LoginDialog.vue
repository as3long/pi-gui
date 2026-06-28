<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { piListPackages, piInstallPackage } from '../../ipc/bridge'
import { notifySuccess, notifyError } from '../../utils/notify'
import ProviderList from './auth/ProviderList.vue'
import ApiKeyForm from './auth/ApiKeyForm.vue'
import ConfiguredKeys from './auth/ConfiguredKeys.vue'
import { usePureMVC } from '../../mvc'
import type { PiAgentAuth } from '../../ipc/bridge'

const emit = defineEmits<{ close: [] }>()

const { getConfigProxy } = usePureMVC()

const isLoading = ref(false)
const selectedProvider = ref('')

// Get auth data from ConfigProxy (single source of truth)
const authData = computed((): PiAgentAuth => getConfigProxy().auth)
const installedPackages = ref<string[]>([])
const isInstalling = ref(false)

const knownProviders = [
  'openai', 'anthropic', 'google', 'mistral', 'deepseek', 'xai',
  'xiaomi', 'nvidia',
  'groq', 'cohere', 'together', 'fireworks', 'replicate',
  'azure_openai', 'bedrock', 'vertex', 'openrouter', 'volcengine', 'custom',
]

const providerInfo: Record<string, { name: string; desc?: string }> = {
  volcengine: { name: 'Volcengine (火山引擎)', desc: 'ByteDance AI - 豆包大模型' },
  xiaomi: { name: 'Xiaomi (小米)', desc: 'MiMo 大模型' },
  nvidia: { name: 'NVIDIA', desc: 'NVIDIA AI Foundation Models' },
}

const configuredProviders = computed(() => Object.keys(authData.value))

const configuredKeysList = computed(() => {
  return configuredProviders.value.map(provider => ({
    provider,
    type: authData.value[provider]?.type || 'api_key',
  }))
})

async function loadConfig() {
  isLoading.value = true
  try {
    // Load auth via PureMVC ConfigProxy
    await getConfigProxy().loadConfig()
    // Load installed packages
    installedPackages.value = await piListPackages()
  } catch (e) {
    console.error('Failed to load config:', e)
  } finally {
    isLoading.value = false
  }
}

async function saveAuth(key: string, type: string) {
  if (!selectedProvider.value || !key.trim()) return
  isLoading.value = true
  try {
    // Save via PureMVC ConfigProxy
    const newAuth: PiAgentAuth = { ...authData.value, [selectedProvider.value]: { type, key: key.trim() } }
    await getConfigProxy().saveAuth(newAuth)
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
    const newAuth: PiAgentAuth = { ...authData.value }
    delete newAuth[provider]
    // Save via PureMVC ConfigProxy
    await getConfigProxy().saveAuth(newAuth)
    if (selectedProvider.value === provider) {
      selectedProvider.value = ''
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
}

function isVolcengineProviderInstalled(): boolean {
  return installedPackages.value.some(p =>
    p.includes('volcengine') || p.includes('pi-volcengine-provider')
  )
}

async function installVolcengineProvider() {
  if (isInstalling.value) return
  isInstalling.value = true
  try {
    await piInstallPackage('npm:pi-volcengine-provider')
    installedPackages.value = await piListPackages()
    notifySuccess('pi-volcengine-provider installed successfully!')
  } catch (e) {
    console.error('Failed to install pi-volcengine-provider:', e)
    notifyError(`Failed to install: ${e}`)
  } finally {
    isInstalling.value = false
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
        <ProviderList
          :providers="knownProviders"
          :configured-providers="configuredProviders"
          :selected-provider="selectedProvider"
          :provider-info="providerInfo"
          @select="selectProvider"
        />

        <ApiKeyForm
          v-if="selectedProvider"
          :provider="selectedProvider"
          :is-configured="configuredProviders.includes(selectedProvider)"
          :provider-info="providerInfo[selectedProvider]"
          :is-loading="isLoading"
          @save="saveAuth"
          @delete="() => deleteAuth(selectedProvider)"
        />

        <!-- Volcengine install hint -->
        <div v-if="selectedProvider === 'volcengine' && !isVolcengineProviderInstalled()" class="install-hint">
          <p>⚠️ <strong>pi-volcengine-provider 未安装</strong></p>
          <button class="btn btn-primary" :disabled="isInstalling" @click="installVolcengineProvider">
            {{ isInstalling ? '⏳ 安装中...' : '📦 安装 pi-volcengine-provider' }}
          </button>
        </div>

        <ConfiguredKeys
          :keys="configuredKeysList"
          @edit="selectProvider"
          @delete="deleteAuth"
        />
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
  background: var(--header-bg);
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
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.install-hint {
  padding: 12px;
  background: var(--warning-bg);
  border-radius: 6px;
  font-size: 0.85em;
}

.install-hint p {
  margin: 0 0 8px;
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
</style>
