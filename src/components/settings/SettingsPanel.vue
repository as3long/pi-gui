<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useSessionStore } from '../../stores/session'
import ModelSelector from './ModelSelector.vue'
import { piNewSession, piSwitchSession } from '../../ipc/bridge'

const emit = defineEmits<{
  close: []
}>()

const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()

// Tab state
const activeTab = ref<'model' | 'general' | 'about' | 'session'>('model')

// Working directory
const cwdInput = ref(settingsStore.cwd)

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
        Model
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'general' }"
        @click="activeTab = 'general'"
      >
        General
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'about' }"
        @click="activeTab = 'about'"
      >
        About
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'session' }"
        @click="activeTab = 'session'"
      >
        Session
      </button>
    </div>

    <!-- Tab content -->
    <div class="tab-content">
      <!-- Model Settings -->
      <div v-if="activeTab === 'model'">
        <ModelSelector />
      </div>

      <!-- General Settings -->
      <div v-if="activeTab === 'general'" class="general-settings">
        <h3 class="section-title">Working Directory</h3>
        <div class="form-group">
          <input
            v-model="cwdInput"
            class="form-input mono"
            placeholder="e.g., C:\Users\huoying\code\my-project"
          />
          <button class="btn btn-primary save-btn" @click="saveCwd">Save</button>
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
        </div>
      </div>

      <!-- About -->
      <div v-if="activeTab === 'about'" class="about-section">
        <h3 class="section-title">Pi GUI v0.1.0</h3>
        <p class="about-text">
          A desktop GUI for <a href="https://pi.dev" target="_blank">pi-coding-agent</a>.
          Built with Tauri + Vue 3 + TypeScript.
        </p>
        <p class="about-text">
          Powered by pi <code>--mode rpc</code> protocol.
        </p>

        <div v-if="sessionStore.stats" class="stats-grid">
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
      <!-- Session Settings -->
      <div v-if="activeTab === 'session'" class="session-settings">
        <h3 class="section-title">Session Management</h3>
        <div class="form-group">
          <button class="btn btn-primary" @click="newSession">New Session</button>
        </div>
        <div class="form-group">
          <input v-model="sessionPath" class="form-input mono" placeholder="Session file path to switch" />
          <button class="btn btn-primary" @click="switchSession">Switch Session</button>
        </div>
        <div v-if="sessionStore.stats" class="stats-grid">
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
}

.tab-btn {
  padding: 10px 16px;
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

.general-settings {
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

.form-group {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
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

.btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85em;
}

.btn-primary {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.btn-primary:hover {
  opacity: 0.9;
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

.about-section {
  padding: 16px;
}

.about-text {
  color: var(--muted-color);
  font-size: 0.9em;
  line-height: 1.6;
  margin-bottom: 12px;
}

.about-text a {
  color: var(--accent-color);
}

.about-text code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  padding: 10px;
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

.session-settings {
  padding: 16px;
}
</style>
