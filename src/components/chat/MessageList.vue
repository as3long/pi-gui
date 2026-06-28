<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import { useChatStore } from '../../stores/chat'
import MessageItem from './MessageItem.vue'
import EmptyState from './EmptyState.vue'
import StreamingMessage from './StreamingMessage.vue'

const chatStore = useChatStore()
const messageListRef = ref<HTMLDivElement | null>(null)
const visibleCount = ref(50) // Show last 50 messages initially

// Reset visible count when session changes
watch(
  () => chatStore.currentSessionId,
  () => {
    visibleCount.value = 50
  }
)

// Only render recent messages for performance
const visibleMessages = computed(() => {
  const all = chatStore.messages
  if (all.length <= visibleCount.value) return all
  return all.slice(all.length - visibleCount.value)
})

const hasMoreMessages = computed(() => chatStore.messages.length > visibleCount.value)

function loadMore() {
  visibleCount.value += 50
}

// Auto-scroll throttling
let scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null
let pendingScroll = false

function doScroll() {
  scrollThrottleTimer = null
  if (pendingScroll) {
    pendingScroll = false
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  }
}

function throttledScroll() {
  pendingScroll = true
  if (!scrollThrottleTimer) {
    nextTick(() => {
      doScroll()
      scrollThrottleTimer = setTimeout(doScroll, 50)
    })
  }
}

// Auto-scroll to bottom on new messages
watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  }
)

// Throttled scroll for streaming updates
watch(
  () => chatStore.streamingMessage.text.length,
  () => throttledScroll()
)

watch(
  () => chatStore.streamingMessage.thinking.length,
  () => throttledScroll()
)

// Scroll to bottom on mount
onMounted(async () => {
  await nextTick()
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
})
</script>

<template>
  <div ref="messageListRef" class="message-list">
    <!-- Empty state -->
    <EmptyState
      v-if="chatStore.messages.length === 0 && chatStore.streamingMessage.isComplete"
    />

    <!-- Load more button -->
    <div v-if="hasMoreMessages" class="load-more">
      <button @click="loadMore" class="btn-load-more">
        Load earlier messages ({{ chatStore.messages.length - visibleCount }} more)
      </button>
    </div>

    <!-- Historical messages -->
    <MessageItem
      v-for="(msg, index) in visibleMessages"
      :key="'msg-' + (chatStore.messages.length - visibleMessages.length + index)"
      :message="msg"
    />

    <!-- Streaming message -->
    <StreamingMessage />
  </div>
</template>

<style scoped>
.message-list {
  padding: 12px 16px;
  height: 100%;
  overflow-y: auto;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.btn-load-more {
  padding: 6px 16px;
  background: var(--hover-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--muted-color);
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.15s;
}

.btn-load-more:hover {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}
</style>
