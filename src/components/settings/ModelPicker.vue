<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useSessionStore } from '../../stores/session'
import { piSetModel, piGetAvailableModels, piSetThinkingLevel, piGetState } from '../../ipc/bridge'

const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()

const isOpen = ref(false)
const searchQuery = ref('')
const dropdownRef = ref<HTMLElement | null>(null)

const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

// Group models by provider
const groupedModels = computed(() => {
  const models = settingsStore.availableModels
  const groups: Record<string, Array<{ id: string; name: string; provider: string; reasoning?: boolean }>> = {}
  
  for (const model of models) {
    if (!groups[model.provider]) {
      groups[model.provider] = []
    }
    groups[model.provider].push(model)
  }
  
  return groups
})

// Filter models based on search
const filteredGroups = computed(() => {
  const query = searchQuery.value.toLowerCase()
  if (!query) return groupedModels.value
  
  const filtered: Record<string, Array<{ id: string; name: string; provider: string; reasoning?: boolean }>> = {}
  
  for (const [provider, models] of Object.entries(groupedModels.value)) {
    const matchingModels = models.filter(m => 
      m.name.toLowerCase().includes(query) || 
      m.id.toLowerCase().includes(query) ||
      provider.toLowerCase().includes(query)
    )
    if (matchingModels.length > 0) {
      filtered[provider] = matchingModels
    }
  }
  
  return filtered
})

const currentModelDisplay = computed(() => {
  if (!sessionStore.currentModel) return null
  return `${sessionStore.currentModel.provider} / ${sessionStore.currentModel.name}`
})

async function selectModel(provider: string, modelId: string) {
  console.log('[ModelPicker] Selecting model:', provider, modelId)
  settingsStore.setProvider(provider)
  settingsStore.setModelId(modelId)
  try {
    await piSetModel(provider, modelId)
    // Get state to update currentModel
    await piGetState()
    console.log('[ModelPicker] Model selected and state updated')
  } catch (e) {
    console.error('[ModelPicker] Failed to set model:', e)
  }
  isOpen.value = false
  searchQuery.value = ''
}

async function refreshModels() {
  console.log('[ModelPicker] Refreshing models...')
  try {
    const models = await piGetAvailableModels()
    console.log('[ModelPicker] Got models:', models.length)
    settingsStore.setAvailableModels(models)
  } catch (e) {
    console.error('[ModelPicker] Failed to refresh models:', e)
  }
}

async function changeThinkingLevel(level: string) {
  settingsStore.setThinkingLevel(level as any)
  await piSetThinkingLevel(level)
}

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
    // Only refresh if models haven't been loaded yet (background, no await)
    if (settingsStore.availableModels.length === 0) {
      refreshModels()
    }
  }
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="model-picker" ref="dropdownRef">
    <!-- Trigger Button -->
    <button class="model-trigger" @click="toggleDropdown">
      <span class="model-icon">🤖</span>
      <span class="model-text" v-if="currentModelDisplay">{{ currentModelDisplay }}</span>
      <span class="model-text waiting" v-else-if="sessionStore.isRunning">Select Model</span>
      <span class="model-text offline" v-else>Offline</span>
      <span class="dropdown-arrow" :class="{ open: isOpen }">▾</span>
    </button>

    <!-- Dropdown -->
    <div v-if="isOpen" class="model-dropdown">
      <!-- Search -->
      <div class="dropdown-search">
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="Search models..."
          autofocus
        />
      </div>

      <!-- Quick Actions -->
      <div class="dropdown-actions">
        <button class="action-btn" @click="refreshModels" title="Refresh model list">
          📋 Refresh
        </button>
      </div>

      <!-- Thinking Level -->
      <div class="dropdown-section">
        <div class="section-label">Thinking</div>
        <div class="thinking-row">
          <button
            v-for="level in thinkingLevels"
            :key="level"
            class="thinking-btn"
            :class="{ active: (sessionStore.thinkingLevel || settingsStore.thinkingLevel) === level }"
            @click="changeThinkingLevel(level)"
          >
            {{ level }}
          </button>
        </div>
      </div>

      <!-- Model List -->
      <div class="dropdown-models">
        <div v-if="Object.keys(filteredGroups).length === 0" class="no-models">
          No models found. Click Refresh.
        </div>
        <div v-for="(models, provider) in filteredGroups" :key="provider" class="model-group">
          <div class="group-header">{{ provider }}</div>
          <button
            v-for="model in models"
            :key="model.id"
            class="model-item"
            :class="{ 
              active: sessionStore.currentModel?.provider === provider && 
                      sessionStore.currentModel?.id === model.id 
            }"
            @click="selectModel(provider, model.id)"
          >
            <span class="model-name">{{ model.name }}</span>
            <span class="model-meta" v-if="model.reasoning">🧠</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-picker {
  position: relative;
}

.model-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--badge-bg);
  color: var(--accent-color);
  cursor: pointer;
  font-size: 0.85em;
  font-weight: 500;
  transition: all 0.15s;
}

.model-trigger:hover {
  border-color: var(--accent-color);
  background: var(--accent-glow);
}

.model-icon {
  font-size: 1em;
}

.model-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-text.waiting {
  color: var(--warning-color);
}

.model-text.offline {
  color: var(--muted-color);
}

.dropdown-arrow {
  font-size: 0.7em;
  transition: transform 0.15s;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 320px;
  max-width: 400px;
  max-height: 480px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dropdown-search {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}

.search-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.85em;
  outline: none;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: var(--accent-color);
}

.dropdown-actions {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}

.action-btn {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.8em;
  transition: all 0.15s;
}

.action-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.dropdown-section {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.section-label {
  font-size: 0.75em;
  color: var(--muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.thinking-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.thinking-btn {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--muted-color);
  cursor: pointer;
  font-size: 0.75em;
  text-transform: uppercase;
  transition: all 0.15s;
}

.thinking-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.thinking-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.dropdown-models {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.no-models {
  padding: 16px;
  text-align: center;
  color: var(--muted-color);
  font-size: 0.85em;
}

.model-group {
  margin-bottom: 4px;
}

.group-header {
  padding: 6px 12px;
  font-size: 0.75em;
  color: var(--muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  background: var(--header-bg);
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.85em;
  text-align: left;
  transition: background 0.1s;
}

.model-item:hover {
  background: var(--hover-bg);
}

.model-item.active {
  background: var(--badge-bg);
  border-left: 2px solid var(--accent-color);
}

.model-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-meta {
  margin-left: 8px;
  font-size: 0.9em;
}
</style>
