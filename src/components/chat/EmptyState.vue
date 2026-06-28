<script setup lang="ts">
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">💬</div>
    <p class="empty-text">Send a message to start chatting with pi</p>
    <p class="empty-hint">Type a message and press Enter to send</p>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted-color);
  text-align: center;
  padding: 40px;
}

.empty-icon {
  font-size: 3em;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 1.1em;
  margin-bottom: 8px;
  color: var(--text-color);
}

.empty-hint {
  font-size: 0.9em;
}
</style>
