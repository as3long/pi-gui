import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type {
  AgentMessage,
  AssistantMessage,
  StreamingMessage,
  RpcEvent,
  MessageContent,
} from '../ipc/types'

// Throttle streaming updates to prevent UI jank (60fps = ~16ms)
const STREAMING_THROTTLE_MS = 16

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
  // Buffered updates for throttling
  let bufferedText = ''
  let bufferedThinking = ''
  let streamingThrottleTimer: ReturnType<typeof setTimeout> | null = null

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
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('[ChatStore] Failed to load messages:', e)
    }
    return []
  }

  // Save messages to localStorage
  function saveMessages(msgs: AgentMessage[]) {
    try {
      // Don't save empty arrays
      if (msgs.length === 0) {
        return
      }
      localStorage.setItem('pi-gui:messages', JSON.stringify(msgs))
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
    messages.value.push(msg)
  }

  function flushBufferedStreaming() {
    if (bufferedText) {
      streamingMessage.value.text += bufferedText
      bufferedText = ''
    }
    if (bufferedThinking) {
      streamingMessage.value.thinking += bufferedThinking
      bufferedThinking = ''
    }
    streamingThrottleTimer = null
  }

  function updateStreaming(event: RpcEvent) {
    if (event.type !== 'message_update') return
    const msgEvent = (event as any).assistant_message_event || (event as any).assistantMessageEvent
    if (!msgEvent) return
    
    streamingMessage.value.isComplete = false

    switch (msgEvent.type) {
      case 'text_delta': {
        const delta = msgEvent.delta || ''
        if (!streamingThrottleTimer) {
          streamingMessage.value.text += delta
          streamingThrottleTimer = setTimeout(flushBufferedStreaming, STREAMING_THROTTLE_MS)
        } else {
          bufferedText += delta
        }
        break
      }
      case 'thinking_delta': {
        const delta = msgEvent.delta || ''
        if (!streamingThrottleTimer) {
          streamingMessage.value.thinking += delta
          streamingThrottleTimer = setTimeout(flushBufferedStreaming, STREAMING_THROTTLE_MS)
        } else {
          bufferedThinking += delta
        }
        break
      }
      case 'toolcall_start': {
        // Flush buffer immediately for structural changes
        flushBufferedStreaming()
        const toolCall = msgEvent.tool_call as any
        const tcId = toolCall?.id || toolCall?.toolCallId || toolCall?.tool_call_id
        const tcName = toolCall?.name || toolCall?.toolName || toolCall?.tool_name || ''
        const tcArgs = toolCall?.arguments || toolCall?.args || toolCall?.input || '{}'
        if (tcId) {
          streamingMessage.value.toolCalls.push({
            id: tcId,
            name: tcName,
            args: typeof tcArgs === 'string' ? tcArgs : JSON.stringify(tcArgs),
            isComplete: false,
            isError: false,
          })
        }
        break
      }
      case 'toolcall_delta': {
        // Flush buffer immediately for structural changes
        flushBufferedStreaming()
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
        flushBufferedStreaming()
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
    // Flush any remaining buffered content first
    flushBufferedStreaming()
    if (streamingThrottleTimer) {
      clearTimeout(streamingThrottleTimer)
      streamingThrottleTimer = null
    }
    // Build messages in chronological order:
    // 1. Assistant text/thinking (if any)
    // 2. For each tool call: assistant toolCall → toolResult
    const toolCalls = streamingMessage.value.toolCalls
    const addedTcIds = new Set<string>()

    // First, add the text/thinking part as one assistant message (if there's content)
    const headerContent: MessageContent[] = []
    if (streamingMessage.value.thinking) {
      headerContent.push({ type: 'thinking', thinking: streamingMessage.value.thinking })
    }
    if (streamingMessage.value.text) {
      headerContent.push({ type: 'text', text: streamingMessage.value.text })
    }

    // If there are tool calls, include the first one in the header message
    // so text and the first tool call appear together naturally
    if (headerContent.length > 0 && toolCalls.length > 0) {
      const firstTc = toolCalls[0]
      headerContent.push({
        type: 'toolCall',
        id: firstTc.id,
        name: firstTc.name,
        arguments: JSON.parse(firstTc.args || '{}'),
      })
      addedTcIds.add(firstTc.id)

      console.log('[ChatStore] Content to add:', headerContent.length, 'items')
      messages.value.push({
        role: 'assistant',
        content: headerContent,
      })

      // Add result for the first tool call
      if (firstTc.result) {
        messages.value.push({
          role: 'toolResult',
          toolCallId: firstTc.id,
          toolName: firstTc.name,
          content: [{ type: 'text', text: firstTc.result }],
          isError: firstTc.isError,
        })
      }
    } else if (headerContent.length > 0) {
      // No tool calls, just text/thinking
      console.log('[ChatStore] Content to add:', headerContent.length, 'items')
      messages.value.push({
        role: 'assistant',
        content: headerContent,
      })
    }

    // For remaining tool calls, each gets its own assistant message + tool result
    for (const tc of toolCalls) {
      if (addedTcIds.has(tc.id)) continue
      addedTcIds.add(tc.id)

      // Assistant message with just this tool call
      messages.value.push({
        role: 'assistant',
        content: [{
          type: 'toolCall',
          id: tc.id,
          name: tc.name,
          arguments: JSON.parse(tc.args || '{}'),
        }],
      })

      // Tool result
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
    switch (event.type) {
      case 'agent_start':
        isStreaming.value = true
        // Reset buffers
        bufferedText = ''
        bufferedThinking = ''
        if (streamingThrottleTimer) {
          clearTimeout(streamingThrottleTimer)
          streamingThrottleTimer = null
        }
        streamingMessage.value = {
          text: '',
          thinking: '',
          toolCalls: [],
          isComplete: false,
        }
        break

      case 'agent_end': {
        console.log('[ChatStore] Agent ended, finalizing...')
        // Use agent_end messages as fallback for tool calls
        const agentMsgs = (event as any).messages
        if (Array.isArray(agentMsgs)) {
          for (const m of agentMsgs) {
            if (m?.role === 'assistant' && Array.isArray(m.content)) {
              for (const c of m.content) {
                if (c.type === 'toolCall' && c.id && !streamingMessage.value.toolCalls.find(t => t.id === c.id)) {
                  console.log('[ChatStore] Capturing tool call from agent_end:', c.name, c.id)
                  streamingMessage.value.toolCalls.push({
                    id: c.id,
                    name: c.name || '',
                    args: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || {}),
                    isComplete: true,
                    isError: false,
                  })
                }
              }
            }
            if (m?.role === 'toolResult' && m.toolCallId) {
              const tc = streamingMessage.value.toolCalls.find(t => t.id === m.toolCallId)
              if (tc) {
                tc.result = m.content?.[0]?.text || ''
                tc.isError = m.isError || false
              }
            }
          }
        }
        isStreaming.value = false
        finalizeStreaming()
        break
      }

      case 'message_update':
        updateStreaming(event)
        break

      case 'message_end': {
        console.log('[ChatStore] Message end received')
        const endMsg = (event as any).message
        if (endMsg?.role === 'assistant' && Array.isArray(endMsg.content)) {
          // Capture tool calls from final message if streaming didn't get them
          for (const c of endMsg.content) {
            if (c.type === 'toolCall' && c.id && !streamingMessage.value.toolCalls.find(t => t.id === c.id)) {
              console.log('[ChatStore] Capturing tool call from message_end:', c.name, c.id)
              streamingMessage.value.toolCalls.push({
                id: c.id,
                name: c.name || '',
                args: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || {}),
                isComplete: true,
                isError: false,
              })
            }
          }
        }
        break
      }

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
