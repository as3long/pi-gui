<script setup lang="ts">
import type { PiAgentSettings, PiAgentAuth } from '../../../ipc/bridge'
import { APP_VERSION } from '../../../utils/version'

defineProps<{
  agentSettings: PiAgentSettings
  agentAuth: PiAgentAuth
  isLoadingAgent: boolean
}>()

const emit = defineEmits<{
  'save-settings': []
  'save-auth': []
  'load-config': []
  'create-example': []
}>()

// Auth display helpers
function getAuthKeyDisplay(config: any): string {
  if (typeof config === 'object' && config?.key) {
    return '••••••••' + String(config.key).slice(-4)
  }
  if (typeof config === 'string') {
    return '••••••••' + config.slice(-4)
  }
  return 'No key found'
}

function getAuthTypeDisplay(config: any): string | null {
  if (typeof config === 'object' && config?.type) {
    return String(config.type)
  }
  return null
}
</script>

<template>
  <div class="tab-panel">
    <div class="section-header">
      <h3 class="section-title">Pi Agent Configuration</h3>
      <div class="section-buttons">
        <button class="btn btn-sm btn-primary" @click="emit('save-settings')" :disabled="isLoadingAgent">
          💾 Save Settings
        </button>
        <button class="btn btn-sm btn-primary" @click="emit('save-auth')" :disabled="isLoadingAgent">
          🔑 Save Auth
        </button>
        <button class="btn btn-sm" @click="emit('create-example')" :disabled="isLoadingAgent">
          📝 Example
        </button>
        <button class="btn btn-sm" @click="emit('load-config')" :disabled="isLoadingAgent">
          {{ isLoadingAgent ? 'Loading...' : '🔄 Refresh' }}
        </button>
      </div>
    </div>

    <!-- Settings JSON -->
    <div class="config-section">
      <h4 class="subsection-title">settings.json</h4>
      <div class="config-path">
        <span class="path-label">Location:</span>
        <span class="path-value">~/.pi/agent/settings.json</span>
      </div>
      <pre class="config-json">{{ JSON.stringify(agentSettings, null, 2) }}</pre>
    </div>

    <!-- Auth JSON -->
    <div class="config-section">
      <h4 class="subsection-title">auth.json</h4>
      <div class="config-path">
        <span class="path-label">Location:</span>
        <span class="path-value">~/.pi/agent/auth.json</span>
      </div>
      <!-- Raw JSON view for debugging -->
      <div class="auth-raw">
        <details class="debug-details">
          <summary>📋 View raw auth.json content (for debugging)</summary>
          <pre class="config-json">{{ JSON.stringify(agentAuth, null, 2) }}</pre>
        </details>
      </div>
      <!-- Formatted list view -->
      <div class="auth-list">
        <div v-for="([provider, config], index) in Object.entries(agentAuth)" :key="index" class="auth-item">
          <div class="auth-provider">{{ provider }}</div>
          <div class="auth-key">
            <span class="key-masked">{{ getAuthKeyDisplay(config) }}</span>
            <span v-if="getAuthTypeDisplay(config)" class="auth-type">{{ getAuthTypeDisplay(config) }}</span>
          </div>
        </div>
        <div v-if="Object.keys(agentAuth).length === 0" class="empty-state">
          No API keys configured<br />
          <small class="empty-hint">Check if auth.json exists at the path above</small>
        </div>
      </div>
    </div>

    <!-- About -->
    <div class="about-section">
      <h4 class="subsection-title">About</h4>
      <p class="about-text">
        Pi GUI {{ APP_VERSION }} - A desktop GUI for
        <a href="https://github.com/earendil-works/pi-coding-agent" target="_blank">
          pi-coding-agent
        </a>
      </p>
      <p class="about-text">
        Built with Tauri + Vue 3 + TypeScript + PureMVC
      </p>
    </div>
  </div>
</template>

<style scoped>
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

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header .section-title {
  margin: 0;
}

.section-buttons {
  display: flex;
  gap: 8px;
}

.config-section {
  margin-bottom: 24px;
}

.config-path {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: var(--badge-bg);
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 0.85em;
}

.path-label {
  color: var(--muted-color);
  font-weight: 500;
}

.path-value {
  color: var(--accent-color);
  font-family: 'SF Mono', monospace;
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

.debug-details {
  margin-bottom: 16px;
  padding: 8px 12px;
  background: var(--badge-bg);
  border-radius: 6px;
  cursor: pointer;
}

.debug-details summary {
  color: var(--muted-color);
  font-size: 0.85em;
  outline: none;
  list-style: none;
}

.debug-details[open] summary {
  margin-bottom: 8px;
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

.empty-hint {
  color: var(--muted-color);
  font-size: 0.8em;
  margin-top: 8px;
  display: block;
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
