<script setup lang="ts">
defineProps<{
  keys: Array<{ provider: string; type: string }>
}>()

const emit = defineEmits<{
  edit: [provider: string]
  delete: [provider: string]
}>()
</script>

<template>
  <div class="configured-keys" v-if="keys.length > 0">
    <h3 class="section-title">Configured Keys ({{ keys.length }})</h3>
    <div class="auth-list">
      <div v-for="item in keys" :key="item.provider" class="auth-item">
        <div class="auth-info">
          <span class="auth-provider">{{ item.provider }}</span>
          <span class="auth-type">{{ item.type }}</span>
        </div>
        <div class="auth-actions">
          <button class="btn btn-sm" @click="emit('edit', item.provider)">Edit</button>
          <button class="btn btn-sm btn-danger" @click="emit('delete', item.provider)">Delete</button>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="empty-hint">
    No API keys configured. Select a provider above to add one.
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

.auth-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auth-provider {
  font-weight: 500;
  color: var(--text-color);
  text-transform: capitalize;
}

.auth-type {
  font-size: 0.75em;
  padding: 2px 6px;
  background: var(--hover-bg);
  border-radius: 4px;
  color: var(--muted-color);
}

.auth-actions {
  display: flex;
  gap: 6px;
}

.btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8em;
  transition: all 0.15s;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 0.75em;
}

.btn:hover {
  background: var(--hover-bg);
}

.btn-danger {
  color: var(--error-color);
  border-color: var(--error-color);
}

.btn-danger:hover {
  background: var(--error-bg);
}

.empty-hint {
  text-align: center;
  padding: 24px;
  color: var(--muted-color);
  font-size: 0.85em;
}
</style>
