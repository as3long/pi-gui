<script setup lang="ts">
import { ref } from 'vue'
import ModelTab from './tabs/ModelTab.vue'
import GeneralTab from './tabs/GeneralTab.vue'
import ConfigTab from './tabs/ConfigTab.vue'
import type { PiAgentSettings, PiAgentAuth } from '../../ipc/bridge'
import { useMediator, SettingsPanelMediator } from '../../mvc'

const emit = defineEmits<{
  close: []
}>()

// Tab state
const activeTab = ref<'model' | 'general' | 'config'>('model')

// Pi Agent settings - Single Source of Truth via PureMVC
const agentSettings = ref<PiAgentSettings>({})
const agentAuth = ref<PiAgentAuth>({})
const isLoadingAgent = ref(false)

// PureMVC Mediator integration
const { mediator } = useMediator(
  () => new SettingsPanelMediator({
    agentSettings,
    agentAuth,
    isLoadingAgent,
  }),
  (mediatorInstance) => {
    // Load config on mount
    mediatorInstance.loadConfig()
  }
)

// Action handlers
function loadAgentConfig() {
  if (mediator) {
    mediator.loadConfig()
  }
}

function saveAgentSettings() {
  if (mediator) {
    mediator.saveSettings(agentSettings.value)
  }
}

function saveAgentAuth() {
  if (mediator) {
    mediator.saveAuth(agentAuth.value)
  }
}

function createExampleAuth() {
  console.log('[SettingsPanel] Creating example auth config')
  agentAuth.value = {
    anthropic: { type: 'api_key', key: 'sk-ant-example-key-here' },
    openai: { type: 'api_key', key: 'sk-example-key-here' },
  }
  console.log('[SettingsPanel] Example auth created, click Save to persist')
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
        :class="{ active: activeTab === 'config' }"
        @click="activeTab = 'config'"
      >
        📄 Config
      </button>
    </div>

    <!-- Tab content -->
    <div class="tab-content">
      <ModelTab v-if="activeTab === 'model'" />
      <GeneralTab
        v-if="activeTab === 'general'"
        :agent-settings="agentSettings"
        @save-settings="saveAgentSettings"
      />

      <ConfigTab
        v-if="activeTab === 'config'"
        :agent-settings="agentSettings"
        :agent-auth="agentAuth"
        :is-loading-agent="isLoadingAgent"
        @save-settings="saveAgentSettings"
        @save-auth="saveAgentAuth"
        @load-config="loadAgentConfig"
        @create-example="createExampleAuth"
      />
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
  color: var(--text-color);
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
</style>
