<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useSessionStore } from '../../stores/session'
import ModelSelector from './ModelSelector.vue'
import { 
  piNewSession, 
  piSwitchSession, 
  piGetAgentSettings, 
  piSetAgentSettings,
  piGetAgentAuth,
  type PiAgentSettings,
  type PiAgentAuth 
} from '../../ipc/bridge'

const emit = defineEmits<{
  close: []
}>()

const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()

// Tab state
const activeTab = ref<'model' | 'general' | 'session' | 'config'>('model')

// Working directory
const cwdInput = ref(settingsStore.cwd)

// Pi Agent settings
const agentSettings = ref<PiAgentSettings>({})
const agentAuth = ref<PiAgentAuth>({})
const isLoadingAgent = ref(false)

function saveCwd() {
  settingsStore.setCwd(cwdInput.value)
}

// Session controls
const sessionPath = ref('')

function newSession() {
  piNewSession()
}

function switchSession() {
  piSwitchSession(sessionPath.value)
}

async function loadAgentConfig() {
  isLoadingAgent.value = true
  try {
    const [settings, auth] = await Promise.all([
      piGetAgentSettings(),
      piGetAgentAuth()
    ])
    agentSettings.value = settings
    agentAuth.value = auth
  } catch (e) {
    console.error('Failed to load agent config:', e)
  } finally {
    isLoadingAgent.value = false
  }
}

async function saveAgentSettings() {
  try {
    await piSetAgentSettings(agentSettings.value)
  } catch (e) {
    console.error('Failed to save agent settings:', e)
  }
}

onMounted(() => {
  loadAgentConfig()
})
</script>

<template>
  <div class="settings-panel">
    <!-- Header -->
    <div class="settings-header">
      <h2 class="settings-title">Settings</h2>
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <!-- Tabs -->
    <div class="settings-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'model' }"
        @click="activeTab = 'model'"
      >
        🤖 Model
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'general' }"
        @click="activeTab = 'general'"
      >
        ⚙️ General
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'session' }"
        @click="activeTab = 'session'"
      >
        📋 Session
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'config' }"
        @click="activeTab = 'config'"
      >
        📄 Config
      </button>
    </div>

    <!-- Tab content -->
    <div class="tab-content">
      <!-- Model Settings -->
      <div v-if="activeTab === 'model'" class="tab-panel">
        <ModelSelector />
        
        <!-- Current Config Info -->
        <div class="config-info">
          <h4 class="subsection-title">Current Configuration</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Default Provider</span>
              <span class="info-value">{{ agentSettings.defaultProvider || 'Not set' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Default Model</span>
              <span class="info-value">{{ agentSettings.defaultModel || 'Not set' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Thinking Level</span>
              <span class="info-value">{{ agentSettings.defaultThinkingLevel || 'Not set' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- General Settings -->
      <div v-if="activeTab === 'general'" class="tab-panel">
        <h3 class="section-title">Working Directory</h3>
        <div class="form-group">
          <input
            v-model="cwdInput"
            class="form-input mono"
            placeholder="e.g., C:\Users\huoying\code\my-project"
          />
          <button class="btn btn-primary save-btn" @click="saveCwd">Save</button>
        </div>

        <h3 class="section-title">Shell Configuration</h3>
        <div class="form-group">
          <label class="form-label">Shell Path</label>
          <input
            v-model="agentSettings.shellPath"
            class="form-input mono"
            placeholder="e.g., /bin/bash or C:\Program Files\Git\bin\bash.exe"
          />
        </div>

        <h3 class="section-title">Toggles</h3>
        <div class="toggle-group">
          <label class="toggle-item">
            <input
              type="checkbox"
              :checked="settingsStore.autoCompaction"
              @change="settingsStore.setAutoCompaction(($event.target as HTMLInputElement).checked)"
            />
            <span>Auto compaction</span>
          </label>
          <label class="toggle-item">
            <input
              type="checkbox"
              :checked="settingsStore.autoRetry"
              @change="settingsStore.setAutoRetry(($event.target as HTMLInputElement).checked)"
            />
            <span>Auto retry</span>
          </label>
          <label class="toggle-item">
            <input
              type="checkbox"
              :checked="settingsStore.darkMode"
              @change="settingsStore.toggleDarkMode()"
            />
            <span>Dark mode</span>
          </label>
          <label class="toggle-item">
            <input
              type="checkbox"
              :checked="agentSettings.terminal?.showTerminalProgress"
              @change="agentSettings.terminal = { ...agentSettings.terminal, showTerminalProgress: ($event.target as HTMLInputElement).checked }"
            />
            <span>Show terminal progress</span>
          </label>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" @click="saveAgentSettings">Save Shell Settings</button>
        </div>
      </div>

      <!-- Session Settings -->
      <div v-if="activeTab === 'session'" class="tab-panel">
        <h3 class="section-title">Session Management</h3>
        <div class="form-group">
          <button class="btn btn-primary" @click="newSession">✨ New Session</button>
        </div>
        <div class="form-group">
          <input v-model="sessionPath" class="form-input mono" placeholder="Session file path to switch" />
          <button class="btn btn-primary" @click="switchSession">🔄 Switch Session</button>
        </div>
        
        <div v-if="sessionStore.stats" class="stats-section">
          <h3 class="section-title">Session Statistics</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Messages</span>
              <span class="stat-value">{{ sessionStore.stats.totalMessages }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Input Tokens</span>
              <span class="stat-value">{{ sessionStore.stats.tokens.input.toLocaleString() }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Output Tokens</span>
              <span class="stat-value">{{ sessionStore.stats.tokens.output.toLocaleString() }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Total Cost</span>
              <span class="stat-value">${{ sessionStore.stats.cost.toFixed(4) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Config (Raw Files) -->
      <div v-if="activeTab === 'config'" class="tab-panel">
        <div class="section-header">
          <h3 class="section-title">Pi Agent Configuration</h3>
          <button class="btn btn-sm" @click="loadAgentConfig" :disabled="isLoadingAgent">
            {{ isLoadingAgent ? 'Loading...' : '🔄 Refresh' }}
          </button>
        </div>
        
        <!-- Settings JSON -->
        <div class="config-section">
          <h4 class="subsection-title">settings.json</h4>
          <pre class="config-json">{{ JSON.stringify(agentSettings, null, 2) }}</pre>
        </div>
        
        <!-- Auth JSON -->
        <div class="config-section">
          <h4 class="subsection-title">auth.json</h4>
          <div class="auth-list">
            <div v-for="(auth, provider) in agentAuth" :key="provider" class="auth-item">
              <div class="auth-provider">{{ provider }}</div>
              <div class="auth-key">
                <span class="key-masked">••••••••{{ auth.key.slice(-4) }}</span>
                <span class="auth-type">{{ auth.type }}</span>
              </div>
            </div>
            <div v-if="Object.keys(agentAuth).length === 0" class="empty-state">
              No API keys configured
            </div>
          </div>
        </div>

        <!-- About -->
        <div class="about-section">
          <h4 class="subsection-title">About</h4>
          <p class="about-text">
            Pi GUI v0.1.0 - A desktop GUI for 
            <a href="https://github.com/earendil-works/pi-coding-agent" target="_blank">
              pi-coding-agent
            </a>
          </p>
          <p class="about-text">
            Built with Tauri + Vue 3 + TypeScript
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
}

.settings-title {
  margin: 0;
  font-size: 1.2em;
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

.settings-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  padding: 0 16px;
  background: var(--header-bg);
}

.tab-btn {
  padding: 12px 16px;
  border: none;
  background: none;
  color: var(--muted-color);
  cursor: pointer;
  font-size: 0.9em;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.tab-btn.active {
  color: var(--accent-color);
  border-bottom-color: var(--accent-color);
}

.tab-btn:hover {
  color: var(--text-color);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}

.tab-panel {
  padding: 20px;
}

.section-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.subsection-title {
  font-size: 0.85em;
  font-weight: 500;
  color: var(--muted-color);
  margin: 0 0 8px;
}

.form-group {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.form-label {
  font-size: 0.85em;
  color: var(--muted-color);
  margin-bottom: 4px;
}

.form-input {
  flex: 1;
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

.form-actions {
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

.btn-sm {
  padding: 4px 10px;
  font-size: 0.8em;
}

.save-btn {
  white-space: nowrap;
}

.toggle-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9em;
}

.toggle-item:hover {
  background: var(--hover-bg);
}

.toggle-item input[type="checkbox"] {
  accent-color: var(--accent-color);
}

/* Config Info */
.config-info {
  margin-top: 24px;
  padding: 16px;
  background: var(--badge-bg);
  border-radius: 8px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 0.75em;
  color: var(--muted-color);
  text-transform: uppercase;
}

.info-value {
  font-size: 0.9em;
  color: var(--text-color);
  font-family: 'SF Mono', monospace;
}

/* Stats */
.stats-section {
  margin-top: 24px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: var(--badge-bg);
  border-radius: 6px;
}

.stat-label {
  font-size: 0.75em;
  color: var(--muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 1.1em;
  font-weight: 600;
  color: var(--text-color);
  font-family: 'SF Mono', monospace;
  margin-top: 4px;
}

/* Config Section */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header .section-title {
  margin: 0;
}

.config-section {
  margin-bottom: 24px;
}

.config-json {
  padding: 12px;
  background: var(--code-bg);
  border-radius: 6px;
  font-family: 'SF Mono', monospace;
  font-size: 0.85em;
  overflow-x: auto;
  color: var(--text-color);
}

.auth-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.auth-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--badge-bg);
  border-radius: 6px;
}

.auth-provider {
  font-weight: 500;
  color: var(--text-color);
  text-transform: capitalize;
}

.auth-key {
  display: flex;
  align-items: center;
  gap: 8px;
}

.key-masked {
  font-family: 'SF Mono', monospace;
  font-size: 0.85em;
  color: var(--muted-color);
}

.auth-type {
  font-size: 0.75em;
  padding: 2px 6px;
  background: var(--hover-bg);
  border-radius: 4px;
  color: var(--muted-color);
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--muted-color);
  font-size: 0.85em;
}

/* About */
.about-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

.about-text {
  color: var(--muted-color);
  font-size: 0.85em;
  line-height: 1.6;
  margin-bottom: 8px;
}

.about-text a {
  color: var(--accent-color);
}
</style>
