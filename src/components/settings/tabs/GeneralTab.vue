<script setup lang="ts">
import type { PiAgentSettings } from '../../../ipc/bridge'
import { useSettingsStore } from '../../../stores/settings'

const props = defineProps<{
  agentSettings: PiAgentSettings
}>()

const emit = defineEmits<{
  'save-settings': []
}>()

const settingsStore = useSettingsStore()
</script>

<template>
  <div class="tab-panel">
    <h3 class="section-title">Shell Configuration</h3>
    <div class="form-group">
      <label class="form-label">Shell Path</label>
      <input
        v-model="props.agentSettings.shellPath"
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
          :checked="props.agentSettings.terminal?.showTerminalProgress"
          @change="
            props.agentSettings.terminal = {
              ...props.agentSettings.terminal,
              showTerminalProgress: ($event.target as HTMLInputElement).checked,
            }
          "
        />
        <span>Show terminal progress</span>
      </label>
    </div>

    <div class="form-actions">
      <button class="btn btn-primary" @click="emit('save-settings')">
        💾 Save Shell Settings
      </button>
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
  gap: 6px;
  margin-bottom: 16px;
}

.form-label {
  font-size: 0.85em;
  color: var(--muted-color);
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
</style>
