// ── RPC Protocol Types ──
// Matches the Rust RPC protocol and pi's RPC JSONL format

export interface ImageContent {
  type: 'image'
  data: string
  mimeType: string
}

// ── RPC Events ──

export type RpcEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages?: AgentMessage[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message?: AgentMessage; tool_results?: ToolResultMessage[] }
  | { type: 'message_start'; message?: AgentMessage }
  | { type: 'message_update'; message?: AgentMessage; assistant_message_event?: AssistantMessageEvent }
  | { type: 'message_end'; message?: AgentMessage }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_execution_update'; toolCallId: string; toolName: string; args: Record<string, unknown>; partialResult?: ToolResult }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; result?: ToolResult; isError?: boolean }
  | { type: 'queue_update'; steering: string[]; follow_up: string[] }
  | { type: 'compaction_start'; reason?: string }
  | { type: 'compaction_end'; reason?: string; result?: unknown; aborted?: boolean; will_retry?: boolean; error_message?: string }
  | { type: 'auto_retry_start'; attempt: number; max_attempts: number; delay_ms: number; error_message: string }
  | { type: 'auto_retry_end'; success: boolean; attempt: number; final_error?: string }
  | { type: 'extension_ui_request'; id: string; method: string; title?: string; message?: string; options?: string[]; placeholder?: string; prefill?: string; notify_type?: string; timeout?: number }
  | { type: 'response'; id?: string; command?: string; success?: boolean; error?: string; data?: unknown }
  | { type: 'extension_error'; extension_path?: string; event?: string; error?: string }

export interface AssistantMessageEvent {
  type: string
  delta?: string
  content_index?: number
  content?: string
  partial?: unknown
  tool_call?: unknown
}

export interface ToolResult {
  content: Array<{ type: string; text?: string }>
  details?: Record<string, unknown>
}

// ── Agent Messages ──

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage

export interface UserMessage {
  role: 'user'
  content: string | MessageContent[]
  timestamp?: number
  attachments?: Attachment[]
}

export interface AssistantMessage {
  role: 'assistant'
  content: MessageContent[]
  api?: string
  provider?: string
  model?: string
  usage?: TokenUsage
  stopReason?: string
  timestamp?: number
}

export interface ToolResultMessage {
  role: 'toolResult'
  toolCallId: string
  toolName: string
  content: Array<{ type: string; text?: string }>
  isError?: boolean
  timestamp?: number
}

export type MessageContent = TextContent | ThinkingContent | ToolCallContent | ImageContent

export interface TextContent {
  type: 'text'
  text: string
}

export interface ThinkingContent {
  type: 'thinking'
  thinking: string
}

export interface ToolCallContent {
  type: 'toolCall'
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface Attachment {
  id: string
  type: 'image'
  fileName: string
  mimeType: string
  size: number
  content: string
}

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost?: TokenCost
}

export interface TokenCost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

// ── Session Stats ──

export interface SessionStats {
  sessionFile?: string
  sessionId: string
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  totalMessages: number
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
  cost: number
  contextUsage?: {
    tokens: number
    contextWindow: number
    percent: number
  }
}

// ── Session Info ──

export interface SessionInfo {
  id: string
  path: string
  name?: string
  cwd: string
  createdAt: string
  messageCount: number
}

// ── Model ──

export interface ModelInfo {
  id: string
  name: string
  api: string
  provider: string
  baseUrl: string
  reasoning: boolean
  contextWindow: number
  maxTokens: number
}

export interface CommandInfo {
  name: string
  description?: string
  source: 'extension' | 'prompt' | 'skill'
  location?: string
  path?: string
}

// ── Streaming State (for UI) ──

export interface StreamingMessage {
  text: string
  thinking: string
  toolCalls: StreamingToolCall[]
  isComplete: boolean
}

export interface StreamingToolCall {
  id: string
  name: string
  args: string
  result?: string
  isComplete: boolean
  isError: boolean
}

// ── UI State ──

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type QueueMode = 'one-at-a-time' | 'all'

export interface UiState {
  isStreaming: boolean
  isCompacting: boolean
  isRetrying: boolean
  model: ModelInfo | null
  thinkingLevel: ThinkingLevel
  sessionFile: string | null
  sessionId: string | null
  sessionName: string | null
  steeringMode: QueueMode
  followUpMode: QueueMode
  messageCount: number
  pendingMessageCount: number
}
