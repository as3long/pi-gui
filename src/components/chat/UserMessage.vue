<script setup lang="ts">
import { computed } from 'vue'
import type { UserMessage } from '../../ipc/types'

const props = defineProps<{
  message: UserMessage
}>()

const textContent = computed(() => {
  const content = props.message.content
  if (typeof content === 'string') return content
  return content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
})
</script>

<template>
  <div class="message-row user-row">
    <div class="message-label">You</div>
    <div class="message-bubble user-bubble">
      {{ textContent }}
    </div>
  </div>
</template>

<style scoped>
.message-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  animation: slideIn 0.15s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-color);
  margin-bottom: 4px;
  padding: 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.message-bubble {
  width: min(720px, 100%);
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  line-height: 1.55;
  font-size: 13px;
}

.user-row {
  align-items: flex-end;
}

.user-bubble {
  background: var(--user-bg);
  border-color: var(--user-border);
}
</style>
