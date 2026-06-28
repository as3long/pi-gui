<script setup lang="ts">
import type { AgentMessage } from '../../ipc/types'
import UserMessage from './UserMessage.vue'
import AssistantMessage from './AssistantMessage.vue'
import ToolResultMessage from './ToolResultMessage.vue'

defineProps<{
  message: AgentMessage
}>()
</script>

<template>
  <UserMessage v-if="message.role === 'user'" :message="message" />
  <AssistantMessage v-else-if="message.role === 'assistant'" :message="message" />
  <ToolResultMessage v-else-if="message.role === 'toolResult'" :message="message" />
</template>
