<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { usePureMVC, ModelProxy } from '../../mvc'
import { useSessionStore } from '../../stores/session'
import { useSettingsStore } from '../../stores/settings'
import { piAbort } from '../../ipc/bridge'

const { facade } = usePureMVC()
const modelProxy = facade.retrieveProxy(ModelProxy.NAME) as ModelProxy
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()

// Use sessionStore stats directly for reactivity
const stats = computed(() => sessionStore.stats)
const thinkingLevel = ref(modelProxy.thinkingLevel)
const cwd = ref(settingsStore.cwd)

// Watchdog state
const isInactive = computed(() => sessionStore.isInactive)
const inactiveSeconds = computed(() => sessionStore.inactiveSeconds)

// Sync thinking level via polling with proper cleanup
const syncTimer = setInterval(() => {
  thinkingLevel.value = modelProxy.thinkingLevel
}, 500)

onUnmounted(() => {
  clearInterval(syncTimer)
})

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'k'
  return String(n)
}

function formatCost(n: number): string {
  if (n >= 1) return '$' + n.toFixed(3)
  if (n >= 0.01) return '$' + n.toFixed(3)
  return '$' + n.toFixed(4)
}

const input = computed(() => stats.value?.tokens.input ?? 0)
const output = computed(() => stats.value?.tokens.output ?? 0)
const total = computed(() => stats.value?.tokens.total ?? 0)
const cost = computed(() => stats.value?.cost ?? 0)
const contextTokens = computed(() => stats.value?.contextUsage?.tokens ?? 0)
const contextWindow = computed(() => stats.value?.contextUsage?.contextWindow ?? 0)
const contextPercent = computed(() => stats.value?.contextUsage?.percent ?? 0)

const contextDisplay = computed(() => {
  if (!contextWindow.value) return null
  return `${formatTokens(contextTokens.value)}/${formatTokens(contextWindow.value)}`
})

async function handleAbort() {
  try {
    await piAbort()
  } catch (e) {
    console.error('[StatusBar] Failed to abort:', e)
  }
}
</script>

<template>
  <div class="status-bar" :class="{ 'inactive': isInactive }">
    <span class="stat" title="Input tokens">↑{{ formatTokens(input) }}</span>
    <span class="stat" title="Output tokens">↓{{ formatTokens(output) }}</span>
    <span class="stat" title="Total tokens">R{{ formatTokens(total) }}</span>
    <span class="stat" title="Context usage">CH{{ contextPercent.toFixed(1) }}%</span>
    <span class="stat" title="Cost">{{ formatCost(cost) }}</span>
    <span class="stat" title="Context window">{{ contextDisplay || 'N/A' }}</span>
    
    <!-- Inactivity warning -->
    <span v-if="isInactive" class="stat inactive-warning" :title="`No activity for ${inactiveSeconds}s`">
      ⚠️ {{ inactiveSeconds }}s inactive
    </span>
    <button v-if="isInactive" class="abort-btn" @click="handleAbort" title="Abort current operation">
      ⏹ Abort
    </button>
    
    <span class="stat cwd" :title="`Working Directory: ${cwd}`">📂 {{ cwd || 'Not set' }}</span>
    <span class="stat thinking" :title="`Thinking: ${thinkingLevel}`">({{ thinkingLevel }})</span>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 12px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.75em;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  color: var(--muted-color);
  flex-shrink: 0;
  overflow-x: auto;
  white-space: nowrap;
}

.status-bar.inactive {
  background: var(--warning-bg);
  border-bottom-color: var(--warning-color);
}

.stat {
  flex-shrink: 0;
}

.stat.thinking {
  color: var(--accent-color);
}

.stat.cwd {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat.inactive-warning {
  color: var(--warning-color);
  font-weight: 600;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.abort-btn {
  flex-shrink: 0;
  padding: 1px 6px;
  background: var(--error-bg);
  color: var(--error-color);
  border: 1px solid var(--error-color);
  border-radius: 4px;
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.15s;
}

.abort-btn:hover {
  background: var(--error-color);
  color: white;
}
</style>
