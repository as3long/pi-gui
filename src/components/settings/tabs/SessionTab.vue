<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../../../stores/session'
import { piNewSession, piSwitchSession } from '../../../ipc/bridge'

const sessionStore = useSessionStore()
const sessionPath = ref('')

function newSession() {
  piNewSession()
}

function switchSession() {
  piSwitchSession(sessionPath.value)
}
</script>

<template>
  <div class="tab-panel">
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

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.form-input {
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
  transition: all 0.15s;
}

.btn-primary {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.btn-primary:hover {
  opacity: 0.9;
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
</style>
