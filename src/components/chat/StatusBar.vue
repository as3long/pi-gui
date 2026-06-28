<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue'
import { usePureMVC, ModelProxy } from '../../mvc'
import { useSessionStore } from '../../stores/session'
import { useSettingsStore } from '../../stores/settings'

const { facade } = usePureMVC()
const modelProxy = facade.retrieveProxy(ModelProxy.NAME) as ModelProxy
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()

// Use sessionStore stats directly for reactivity
const stats = computed(() => sessionStore.stats)
const thinkingLevel = ref(modelProxy.thinkingLevel)
const cwd = ref(settingsStore.cwd)

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
</script>

<template>
  <div class="status-bar">
    <span class="stat" title="Input tokens">↑{{ formatTokens(input) }}</span>
    <span class="stat" title="Output tokens">↓{{ formatTokens(output) }}</span>
    <span class="stat" title="Total tokens">R{{ formatTokens(total) }}</span>
    <span class="stat" title="Context usage">CH{{ contextPercent.toFixed(1) }}%</span>
    <span class="stat" title="Cost">{{ formatCost(cost) }}</span>
    <span class="stat" title="Context window">{{ contextDisplay || 'N/A' }}</span>
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
</style>
