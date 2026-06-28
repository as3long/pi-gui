import { Proxy } from '@puremvc/puremvc-js-multicore-framework'

/**
 * Chat message types
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'toolResult'
  content: any
  timestamp?: number
}

/**
 * Chat Proxy - Single source of truth for chat messages and streaming state
 */
export class ChatProxy extends Proxy {
  static readonly NAME: string = 'ChatProxy'

  private _state = {
    messages: [] as ChatMessage[],
    isStreaming: false,
    isCompacting: false,
    isRetrying: false,
    streamingMessage: {
      text: '',
      thinking: '',
      toolCalls: [] as Array<{ id: string; name: string; args: string; isComplete: boolean; isError: boolean; result?: string }>,
      isComplete: true,
    },
    pendingSteering: [] as string[],
    pendingFollowUp: [] as string[],
  }

  constructor() {
    super(ChatProxy.NAME, null)
    this.loadPersisted()
    console.log('[PureMVC] ChatProxy initialized')
  }

  private getState() {
    return this._state
  }

  get messages(): ChatMessage[] {
    return this.getState().messages
  }

  get isStreaming(): boolean {
    return this.getState().isStreaming
  }

  get isCompacting(): boolean {
    return this.getState().isCompacting
  }

  get isRetrying(): boolean {
    return this.getState().isRetrying
  }

  get streamingMessage() {
    return this.getState().streamingMessage
  }

  get pendingSteering(): string[] {
    return this.getState().pendingSteering
  }

  get pendingFollowUp(): string[] {
    return this.getState().pendingFollowUp
  }

  addMessage(msg: ChatMessage): void {
    this.getState().messages = [...this.getState().messages, msg]
    this.savePersisted()
  }

  clearMessages(): void {
    this.getState().messages = []
    this.savePersisted()
  }

  setStreaming(value: boolean): void {
    this.getState().isStreaming = value
  }

  setCompacting(value: boolean): void {
    this.getState().isCompacting = value
  }

  setRetrying(value: boolean): void {
    this.getState().isRetrying = value
  }

  updateStreamingText(text: string): void {
    this.getState().streamingMessage.text = text
  }

  updateStreamingThinking(thinking: string): void {
    this.getState().streamingMessage.thinking = thinking
  }

  addToolCall(toolCall: { id: string; name: string; args: string }): void {
    this.getState().streamingMessage.toolCalls.push({
      ...toolCall,
      isComplete: false,
      isError: false,
    })
  }

  updateToolCall(id: string, update: Partial<{ args: string; isComplete: boolean; isError: boolean; result: string }>): void {
    const tc = this.getState().streamingMessage.toolCalls.find((t) => t.id === id)
    if (tc) {
      Object.assign(tc, update)
    }
  }

  clearStreamingMessage(): void {
    this.getState().streamingMessage = {
      text: '',
      thinking: '',
      toolCalls: [],
      isComplete: true,
    }
  }

  setPendingSteering(value: string[]): void {
    this.getState().pendingSteering = value
  }

  setPendingFollowUp(value: string[]): void {
    this.getState().pendingFollowUp = value
  }

  private savePersisted(): void {
    try {
      const msgsToSave = this.getState().messages.slice(-50)
      localStorage.setItem('pi-gui:messages', JSON.stringify(msgsToSave))
    } catch (e) {
      console.warn('[ChatProxy] Failed to save persisted state:', e)
    }
  }

  private loadPersisted(): void {
    try {
      const saved = localStorage.getItem('pi-gui:messages')
      if (saved) {
        this.getState().messages = JSON.parse(saved)
      }
    } catch (e) {
      console.warn('[ChatProxy] Failed to load persisted state:', e)
    }
  }
}
