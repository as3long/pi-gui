<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  providers: string[]
  configuredProviders: string[]
  selectedProvider: string
  providerInfo?: Record<string, { name: string; desc?: string }>
}>()

const emit = defineEmits<{
  select: [provider: string]
}>()

const searchQuery = ref('')

const filteredProviders = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return props.providers
  return props.providers.filter(p => p.includes(q) || p.startsWith(q))
})
</script>

<template>
  <div class="provider-list">
    <h3 class="section-title">Provider</h3>
    <input
      v-model="searchQuery"
      class="form-input search-input"
      placeholder="Search providers..."
    />
    <div class="provider-grid">
      <button
        v-for="provider in filteredProviders"
        :key="provider"
        class="provider-btn"
        :class="{
          active: selectedProvider === provider,
          configured: configuredProviders.includes(provider)
        }"
        @click="emit('select', provider)"
      >
        {{ providerInfo?.[provider]?.name || provider }}
        <span v-if="providerInfo?.[provider]?.desc" class="provider-desc">
          {{ providerInfo[provider].desc }}
        </span>
        <span v-if="configuredProviders.includes(provider)" class="check">✓</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.search-input {
  width: 100%;
  margin-bottom: 12px;
}

.form-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9em;
}

.form-input:focus {
  border-color: var(--accent-color);
  outline: none;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.provider-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.85em;
  text-transform: capitalize;
  transition: all 0.15s;
  position: relative;
}

.provider-btn:hover {
  border-color: var(--accent-color);
  background: var(--badge-bg);
}

.provider-btn.active {
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: white;
}

.provider-btn.configured {
  border-color: var(--success-color);
}

.provider-desc {
  font-size: 0.75em;
  color: var(--muted-color);
  text-transform: none;
}

.provider-btn.active .provider-desc {
  color: rgba(255, 255, 255, 0.8);
}

.check {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  color: var(--success-color);
}

.provider-btn.active .check {
  color: white;
}
</style>
