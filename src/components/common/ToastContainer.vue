<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { setNotifyFn } from '../../utils/notify'

interface Toast {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration: number
}

const toasts = ref<Toast[]>([])
let nextId = 0

function addToast(type: Toast['type'], message: string, duration = 3000) {
  const id = nextId++
  toasts.value.push({ id, type, message, duration })
  
  // Auto remove
  setTimeout(() => {
    removeToast(id)
  }, duration)
}

function removeToast(id: number) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx !== -1) {
    toasts.value.splice(idx, 1)
  }
}

// Expose for global use
defineExpose({ addToast })

onMounted(() => {
  // Register global notify function
  setNotifyFn(addToast)
  // Expose to window for bridge.ts
  ;(window as any).__piNotify = addToast
})

onUnmounted(() => {
  setNotifyFn(() => {}) // Reset
})
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.type}`]"
        @click="removeToast(toast.id)"
      >
        <span class="toast-icon">
          {{ toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : toast.type === 'warning' ? '⚠' : 'ℹ' }}
        </span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  pointer-events: auto;
  max-width: 360px;
  animation: slideIn 0.3s ease;
}

.toast-success {
  border-color: var(--success-color, #22c55e);
  background: var(--success-bg, rgba(34, 197, 94, 0.1));
}

.toast-error {
  border-color: var(--error-color, #ef4444);
  background: var(--error-bg, rgba(239, 68, 68, 0.1));
}

.toast-warning {
  border-color: var(--warning-color, #f59e0b);
  background: var(--warning-bg, rgba(245, 158, 11, 0.1));
}

.toast-info {
  border-color: var(--info-color, #3b82f6);
  background: var(--info-bg, rgba(59, 130, 246, 0.1));
}

.toast-icon {
  font-size: 14px;
  font-weight: bold;
}

.toast-success .toast-icon { color: var(--success-color, #22c55e); }
.toast-error .toast-icon { color: var(--error-color, #ef4444); }
.toast-warning .toast-icon { color: var(--warning-color, #f59e0b); }
.toast-info .toast-icon { color: var(--info-color, #3b82f6); }

.toast-message {
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.4;
}

/* Transition */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
