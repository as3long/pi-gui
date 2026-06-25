import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
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
  const messages = ref<AgentMessage[]>(loadMessages())
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

  // Watch for message changes and save to localStorage
  watch(
    () => messages.value,
    (newMessages) => {
      saveMessages(newMessages)
    },
    { deep: true }
  )

  // Load messages from localStorage
  function loadMessages(): AgentMessage[] {
    try {
      const saved = localStorage.getItem('pi-gui:messages')
      if (saved) {
        const messages = JSON.parse(saved)
        console.log('[ChatStore] Loaded messages from localStorage:', messages.length)
        return messages
      }
    } catch (e) {
      console.error('[ChatStore] Failed to load messages:', e)
    }
    console.log('[ChatStore] No saved messages found')
    return []
  }

  // Save messages to localStorage
  function saveMessages(msgs: AgentMessage[]) {
    try {
      // Don't save streaming messages or empty arrays
      if (msgs.length === 0 || isStreaming.value) {
        return
      }
      localStorage.setItem('pi-gui:messages', JSON.stringify(msgs))
      console.log('[ChatStore] Saved messages to localStorage:', msgs.length)
    } catch (e) {
      console.error('[ChatStore] Failed to save messages:', e)
    }
  }

  // ── Computed ──
  const lastAssistantMessage = computed(() => {
    return [...messages.value].reverse().find((m) => m.role === 'assistant') as AssistantMessage | undefined
  })

  const currentStreamingText = computed(() => streamingMessage.value.text)

  // ── Actions ──

  function addMessage(msg: AgentMessage) {
    console.log('[ChatStore] Adding message:', msg.role)
    messages.value.push(msg)
    console.log('[ChatStore] Total messages:', messages.value.length)
  }

  function updateStreaming(event: RpcEvent) {
    if (event.type !== 'message_update') return
    // Support both camelCase and snake_case field names
    const msgEvent = (event as any).assistant_message_event || (event as any).assistantMessageEvent
    if (!msgEvent) {
      console.log('[ChatStore] No assistant message event found')
      return
    }
    
    console.log('[ChatStore] Updating streaming with event:', msgEvent.type)
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
    // Support both camelCase and snake_case field names
    const toolCallId = (event as any).toolCallId || (event as any).tool_call_id
    const tc = streamingMessage.value.toolCalls.find((t) => t.id === toolCallId)
    if (tc) {
      tc.isComplete = false
    }
  }

  function onToolExecutionUpdate(event: RpcEvent) {
    if (event.type !== 'tool_execution_update') return
    // Support both camelCase and snake_case field names
    const toolCallId = (event as any).toolCallId || (event as any).tool_call_id
    const text = (event as any).partialResult?.content?.[0]?.text || ''
    const tc = streamingMessage.value.toolCalls.find((t) => t.id === toolCallId)
    if (tc) {
      tc.result = (tc.result || '') + text
    }
  }

  function onToolExecutionEnd(event: RpcEvent) {
    if (event.type !== 'tool_execution_end') return
    // Support both camelCase and snake_case field names
    const toolCallId = (event as any).toolCallId || (event as any).tool_call_id
    const isError = (event as any).isError || (event as any).is_error || false
    const result = (event as any).result
    const tc = streamingMessage.value.toolCalls.find((t) => t.id === toolCallId)
    if (tc) {
      tc.isComplete = true
      tc.isError = isError
      tc.result = result?.content?.[0]?.text || tc.result || ''
    }
  }

  function finalizeStreaming() {
    console.log('[ChatStore] Finalizing streaming...')
    console.log('[ChatStore] Streaming text:', streamingMessage.value.text)
    console.log('[ChatStore] Streaming thinking:', streamingMessage.value.thinking)
    
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

    console.log('[ChatStore] Content to add:', content.length, 'items')
    
    if (content.length > 0) {
      const assistantMsg: AssistantMessage = {
        role: 'assistant',
        content,
      }
      console.log('[ChatStore] Adding assistant message:', assistantMsg)
      messages.value.push(assistantMsg)
      console.log('[ChatStore] Total messages after add:', messages.value.length)
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
    localStorage.removeItem('pi-gui:messages')
  }

  // ── Event Handlers ──

  function handleEvent(event: RpcEvent) {
    console.log('[ChatStore] Processing event:', event.type)
    
    switch (event.type) {
      case 'agent_start':
        console.log('[ChatStore] Agent started')
        isStreaming.value = true
        streamingMessage.value = {
          text: '',
          thinking: '',
          toolCalls: [],
          isComplete: false,
        }
        break

      case 'agent_end':
        console.log('[ChatStore] Agent ended, finalizing...')
        isStreaming.value = false
        finalizeStreaming()
        break

      case 'message_update':
        console.log('[ChatStore] Message update received')
        updateStreaming(event)
        break

      case 'message_end':
        console.log('[ChatStore] Message end received')
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
