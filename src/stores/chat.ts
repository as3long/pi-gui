import { defineStore } from 'pinia'
import { ref, shallowRef, computed, watch } from 'vue'
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
 * Chat store manages conversation messages per session.
 * Each session has its own message history.
 */
export const useChatStore = defineStore('chat', () => {
  // ── State ──
  // Map of sessionId -> messages
  const messagesBySession = shallowRef<Map<string, AgentMessage[]>>(new Map())
  const currentSessionId = ref<string | null>(null)
  
  const isStreaming = ref(false)
  const isCompacting = ref(false)
  const isRetrying = ref(false)
  const pendingSteering = ref<string[]>([])
  const pendingFollowUp = ref<string[]>([])

  // Temporary session counter
  let tempSessionCounter = 0

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

  // Load all sessions from localStorage on init
  function loadAllSessions(): Map<string, AgentMessage[]> {
    const map = new Map<string, AgentMessage[]>()
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('pi-gui:chat:')) {
          const sessionId = key.replace('pi-gui:chat:', '')
          const saved = localStorage.getItem(key)
          if (saved) {
            map.set(sessionId, JSON.parse(saved))
          }
        }
      }
    } catch (e) {
      console.error('[ChatStore] Failed to load sessions:', e)
    }
    return map
  }

  // Initialize with saved data
  messagesBySession.value = loadAllSessions()

  // Watch for message changes and save to localStorage (debounced)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  
  function saveCurrentSession() {
    if (!currentSessionId.value) return
    const msgs = messagesBySession.value.get(currentSessionId.value) || []
    if (msgs.length === 0) return
    
    try {
      // Only save last 100 messages per session
      const msgsToSave = msgs.slice(-100)
      localStorage.setItem(`pi-gui:chat:${currentSessionId.value}`, JSON.stringify(msgsToSave))
    } catch (e) {
      console.error('[ChatStore] Failed to save session:', e)
    }
  }

  // Watch messages map changes
  watch(
    () => messagesBySession.value.size,
    () => {
      if (saveTimeout) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(saveCurrentSession, 500)
    }
  )

  // ── Computed ──
  // Current session's messages
  const messages = computed(() => {
    if (!currentSessionId.value) return []
    return messagesBySession.value.get(currentSessionId.value) || []
  })

  // Check if current session is temporary (not yet created on backend)
  const isCurrentSessionTemp = computed(() => {
    return currentSessionId.value?.startsWith('temp-') || false
  })

  const lastAssistantMessage = computed(() => {
    return [...messages.value].reverse().find((m) => m.role === 'assistant') as AssistantMessage | undefined
  })

  const currentStreamingText = computed(() => streamingMessage.value.text)

  // ── Actions ──

  /** Check if we have messages for a session in memory */
  function hasSessionMessages(sessionId: string): boolean {
    return messagesBySession.value.has(sessionId)
  }

  /** Batch load messages for a session */
  function loadSessionMessages(sessionId: string, messages: AgentMessage[]) {
    const newMap = new Map(messagesBySession.value)
    newMap.set(sessionId, [...messages])
    messagesBySession.value = newMap
    currentSessionId.value = sessionId
  }

  /** Create a new empty chat (temp session, will be created on first message) */
  function createNewChat(): string {
    const tempId = `temp-${++tempSessionCounter}-${Date.now()}`
    const newMap = new Map(messagesBySession.value)
    newMap.set(tempId, [])
    messagesBySession.value = newMap
    currentSessionId.value = tempId
    return tempId
  }

  /** Replace temp session with real session ID */
  function replaceTempSession(realSessionId: string) {
    if (!currentSessionId.value?.startsWith('temp-')) return
    
    const tempId = currentSessionId.value
    const newMap = new Map(messagesBySession.value)
    const tempMessages = newMap.get(tempId) || []
    newMap.delete(tempId)
    newMap.set(realSessionId, tempMessages)
    messagesBySession.value = newMap
    currentSessionId.value = realSessionId
    
    // Save to localStorage
    try {
      localStorage.setItem(`pi-gui:chat:${realSessionId}`, JSON.stringify(tempMessages.slice(-100)))
      localStorage.removeItem(`pi-gui:chat:${tempId}`)
    } catch (e) {
      console.error('[ChatStore] Failed to save session:', e)
    }
  }

  function setSession(sessionId: string | null) {
    // Save current session before switching
    if (currentSessionId.value) {
      saveCurrentSession()
    }
    currentSessionId.value = sessionId
  }

  function addMessage(msg: AgentMessage) {
    if (!currentSessionId.value) return
    
    const sessionMessages = messagesBySession.value.get(currentSessionId.value) || []
    sessionMessages.push(msg)
    
    // Create new Map to trigger reactivity
    const newMap = new Map(messagesBySession.value)
    newMap.set(currentSessionId.value, [...sessionMessages])
    messagesBySession.value = newMap
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
        // Don't flush buffer immediately - batch these updates to reduce UI churn
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

  let isFinalizing = false
  
  function finalizeStreaming() {
    // Prevent double finalization
    if (isFinalizing || streamingMessage.value.isComplete) {
      console.log('[ChatStore] Skipping finalize - already finalized or finalizing')
      return
    }
    isFinalizing = true
    console.log('[ChatStore] finalizeStreaming called')
    
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
    const newMessages: AgentMessage[] = []

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
      newMessages.push({
        role: 'assistant',
        content: headerContent,
      })

      // Add result for the first tool call
      if (firstTc.result) {
        newMessages.push({
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
      newMessages.push({
        role: 'assistant',
        content: headerContent,
      })
    }

    // For remaining tool calls, each gets its own assistant message + tool result
    for (const tc of toolCalls) {
      if (addedTcIds.has(tc.id)) continue
      addedTcIds.add(tc.id)

      // Assistant message with just this tool call
      newMessages.push({
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
        newMessages.push({
          role: 'toolResult',
          toolCallId: tc.id,
          toolName: tc.name,
          content: [{ type: 'text', text: tc.result }],
          isError: tc.isError,
        })
      }
    }

    // Add all messages to current session
    if (newMessages.length > 0 && currentSessionId.value) {
      const sessionMessages = messagesBySession.value.get(currentSessionId.value) || []
      const newMap = new Map(messagesBySession.value)
      newMap.set(currentSessionId.value, [...sessionMessages, ...newMessages])
      messagesBySession.value = newMap
    }

    // Reset streaming state
    streamingMessage.value = {
      text: '',
      thinking: '',
      toolCalls: [],
      isComplete: true,
    }
    isFinalizing = false
  }

  function clearMessages() {
    if (!currentSessionId.value) return
    
    // Clear current session's messages
    const newMap = new Map(messagesBySession.value)
    newMap.delete(currentSessionId.value)
    messagesBySession.value = newMap
    
    // Clear the debounced timeout if any
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    // Stop streaming and cleanup
    isStreaming.value = false
    isCompacting.value = false
    stopStreamingWatchdog()
    localStorage.removeItem(`pi-gui:chat:${currentSessionId.value}`)
  }

  // ── Event Handlers ──

  // ── Streaming Watchdog ──
  let streamingWatchdogTimer: ReturnType<typeof setTimeout> | null = null
  let streamingLastActivity = Date.now()

  function startStreamingWatchdog() {
    streamingLastActivity = Date.now()
    if (streamingWatchdogTimer) {
      clearTimeout(streamingWatchdogTimer)
    }
    // Check every 30 seconds
    streamingWatchdogTimer = setTimeout(() => {
      const inactiveTime = (Date.now() - streamingLastActivity) / 1000
      if (inactiveTime > 120 && isStreaming.value) {
        console.warn('[ChatStore] No streaming activity for 120s - UI may be unresponsive')
        // Force allow abort by keeping isStreaming true
      }
    }, 30000)
  }

  function resetStreamingWatchdog() {
    streamingLastActivity = Date.now()
  }

  function stopStreamingWatchdog() {
    if (streamingWatchdogTimer) {
      clearTimeout(streamingWatchdogTimer)
      streamingWatchdogTimer = null
    }
  }

  function handleEvent(event: RpcEvent) {
    // Reset watchdog on any streaming event
    if (event.type === 'message_update' || event.type === 'tool_execution_start' || 
        event.type === 'tool_execution_update' || event.type === 'tool_execution_end') {
      resetStreamingWatchdog()
    }

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
        // Start watchdog - if no activity for 120s, allow abort
        startStreamingWatchdog()
        break

      case 'agent_end': {
        console.log('[ChatStore] Agent ended, finalizing...')
        stopStreamingWatchdog()
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
        const endMsg = (event as any).message
        console.log('[ChatStore] Message end, role:', endMsg?.role, 'customType:', endMsg?.customType)
        
        // Handle assistant messages (streaming finalize)
        if (endMsg?.role === 'assistant' && Array.isArray(endMsg.content)) {
          // Update streaming message with final content
          for (const c of endMsg.content) {
            if (c.type === 'text' && c.text) {
              streamingMessage.value.text = c.text
            } else if (c.type === 'thinking' && c.thinking) {
              streamingMessage.value.thinking = c.thinking
            } else if (c.type === 'toolCall' && c.id && !streamingMessage.value.toolCalls.find(t => t.id === c.id)) {
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
          
          // Finalize this message (add to messages array)
          console.log('[ChatStore] Finalizing from message_end')
          finalizeStreaming()
        }
        // Handle custom messages from extensions (e.g., weather results)
        else if (endMsg?.customType && endMsg?.content) {
          console.log('[ChatStore] Adding custom message:', endMsg.customType)
          const text = typeof endMsg.content === 'string' 
            ? endMsg.content 
            : Array.isArray(endMsg.content) 
              ? endMsg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
              : ''
          if (text) {
            addMessage({
              role: 'assistant',
              content: [{ type: 'text', text }],
            })
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
        pendingSteering.value = (event as any).steering || []
        pendingFollowUp.value = (event as any).follow_up || []
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
    currentSessionId,
    isCurrentSessionTemp,
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
    hasSessionMessages,
    loadSessionMessages,
    createNewChat,
    replaceTempSession,
    setSession,
    addMessage,
    clearMessages,
    handleEvent,
  }
})
