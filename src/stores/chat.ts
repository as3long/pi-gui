import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AgentMessage,
  AssistantMessage,
  StreamingMessage,
  RpcEvent,
  TextContent,
  ThinkingContent,
  ToolCallContent,
} from '../ipc/types'

/**
 * Chat store manages the conversation messages and streaming state.
 */
export const useChatStore = defineStore('chat', () => {
  // ── State ──
  const messages = ref<AgentMessage[]>([])
  const isStreaming = ref(false)
  const isCompacting = ref(false)
  const isRetrying = ref(false)
  const pendingSteering = ref<string[]>([])
  const pendingFollowUp = ref<string[]>([])

  // Streaming state for the current in-progress assistant message
  const streamingMessage = ref<StreamingMessage>({
    text: '',
    thinking: '',
    toolCalls: [],
    isComplete: true,
  })

  // ── Computed ──
  const lastAssistantMessage = computed(() => {
    return [...messages.value].reverse().find((m) => m.role === 'assistant') as AssistantMessage | undefined
  })

  const currentStreamingText = computed(() => streamingMessage.value.text)

  // ── Actions ──

  function addMessage(msg: AgentMessage) {
    messages.value.push(msg)
  }

  function updateStreaming(event: RpcEvent) {
    if (event.type !== 'message_update') return
    const msgEvent = event.assistant_message_event
    if (!msgEvent) return

    streamingMessage.value.isComplete = false

    switch (msgEvent.type) {
      case 'text_delta':
        streamingMessage.value.text += msgEvent.delta || ''
        break
      case 'thinking_delta':
        streamingMessage.value.thinking += msgEvent.delta || ''
        break
      case 'toolcall_start': {
        const toolCall = msgEvent.tool_call as { id?: string; name?: string; arguments?: string } | undefined
        if (toolCall?.id) {
          streamingMessage.value.toolCalls.push({
            id: toolCall.id,
            name: toolCall.name || '',
            args: toolCall.arguments || '',
            isComplete: false,
            isError: false,
          })
        }
        break
      }
      case 'toolcall_delta': {
        const tc = msgEvent.tool_call as { id?: string; arguments?: string } | undefined
        if (tc?.id) {
          const existing = streamingMessage.value.toolCalls.find((t) => t.id === tc.id)
          if (existing) {
            existing.args += tc.arguments || ''
          }
        }
        break
      }
      case 'toolcall_end': {
        // tool call complete - it'll be followed by execution events
        break
      }
    }
  }

  function onToolExecutionStart(event: RpcEvent) {
    if (event.type !== 'tool_execution_start') return
    const tc = streamingMessage.value.toolCalls.find((t) => t.id === event.toolCallId)
    if (tc) {
      tc.isComplete = false
    }
  }

  function onToolExecutionUpdate(event: RpcEvent) {
    if (event.type !== 'tool_execution_update') return
    const text = event.partialResult?.content?.[0]?.text || ''
    const tc = streamingMessage.value.toolCalls.find((t) => t.id === event.toolCallId)
    if (tc) {
      tc.result = (tc.result || '') + text
    }
  }

  function onToolExecutionEnd(event: RpcEvent) {
    if (event.type !== 'tool_execution_end') return
    const tc = streamingMessage.value.toolCalls.find((t) => t.id === event.toolCallId)
    if (tc) {
      tc.isComplete = true
      tc.isError = event.isError || false
      tc.result = event.result?.content?.[0]?.text || tc.result || ''
    }
  }

  function finalizeStreaming() {
    // Build final assistant message from streaming state
    const content: (TextContent | ThinkingContent | ToolCallContent)[] = []

    if (streamingMessage.value.thinking) {
      content.push({ type: 'thinking', thinking: streamingMessage.value.thinking })
    }

    if (streamingMessage.value.text) {
      content.push({ type: 'text', text: streamingMessage.value.text })
    }

    for (const tc of streamingMessage.value.toolCalls) {
      content.push({
        type: 'toolCall',
        id: tc.id,
        name: tc.name,
        arguments: JSON.parse(tc.args || '{}'),
      })
    }

    if (content.length > 0) {
      const assistantMsg: AssistantMessage = {
        role: 'assistant',
        content,
      }
      messages.value.push(assistantMsg)
    }

    // Also add tool result messages
    for (const tc of streamingMessage.value.toolCalls) {
      if (tc.result) {
        messages.value.push({
          role: 'toolResult',
          toolCallId: tc.id,
          toolName: tc.name,
          content: [{ type: 'text', text: tc.result }],
          isError: tc.isError,
        })
      }
    }

    // Reset streaming state
    streamingMessage.value = {
      text: '',
      thinking: '',
      toolCalls: [],
      isComplete: true,
    }
  }

  function clearMessages() {
    messages.value = []
  }

  // ── Event Handlers ──

  function handleEvent(event: RpcEvent) {
    switch (event.type) {
      case 'agent_start':
        isStreaming.value = true
        streamingMessage.value = {
          text: '',
          thinking: '',
          toolCalls: [],
          isComplete: false,
        }
        break

      case 'agent_end':
        isStreaming.value = false
        finalizeStreaming()
        break

      case 'message_update':
        updateStreaming(event)
        break

      case 'message_end':
        // We finalize on agent_end instead to batch all tool results
        break

      case 'tool_execution_start':
        onToolExecutionStart(event)
        break

      case 'tool_execution_update':
        onToolExecutionUpdate(event)
        break

      case 'tool_execution_end':
        onToolExecutionEnd(event)
        break

      case 'queue_update':
        pendingSteering.value = event.steering
        pendingFollowUp.value = event.follow_up
        break

      case 'compaction_start':
        isCompacting.value = true
        break

      case 'compaction_end':
        isCompacting.value = false
        break

      case 'auto_retry_start':
        isRetrying.value = true
        break

      case 'auto_retry_end':
        isRetrying.value = false
        break
    }
  }

  return {
    // State
    messages,
    isStreaming,
    isCompacting,
    isRetrying,
    pendingSteering,
    pendingFollowUp,
    streamingMessage,

    // Computed
    lastAssistantMessage,
    currentStreamingText,

    // Actions
    addMessage,
    clearMessages,
    handleEvent,
  }
})
