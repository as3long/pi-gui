// ── Core Types ──

export type WorkspaceId = string;
export type SessionId = string;
export type RunId = string;
export type Timestamp = string;

// ── Workspace ──

export interface WorkspaceRef {
  readonly workspaceId: WorkspaceId;
  readonly path: string;
  readonly displayName?: string;
}

// ── Session ──

export interface SessionRef {
  readonly workspaceId: WorkspaceId;
  readonly sessionId: SessionId;
}

export type SessionStatus = "idle" | "running" | "failed";

export type SessionMessageDeliveryMode = "steer" | "followUp";

export interface SessionQueuedMessage {
  readonly id: string;
  readonly mode: SessionMessageDeliveryMode;
  readonly text: string;
  readonly attachments?: readonly SessionAttachment[];
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface SessionConfig {
  readonly provider?: string;
  readonly modelId?: string;
  readonly thinkingLevel?: string;
}

export interface SessionSnapshot {
  readonly ref: SessionRef;
  readonly workspace: WorkspaceRef;
  readonly title: string;
  readonly status: SessionStatus;
  readonly updatedAt: Timestamp;
  readonly archivedAt?: Timestamp;
  readonly preview?: string;
  readonly config?: SessionConfig;
  readonly runningRunId?: RunId;
  readonly queuedMessages?: readonly SessionQueuedMessage[];
  readonly messageCount?: number;
  readonly filePath?: string;
}

// ── Session Tree ──

export type SessionTreeNodeKind =
  | "message"
  | "thinking_level_change"
  | "model_change"
  | "compaction"
  | "branch_summary"
  | "custom"
  | "custom_message"
  | "label"
  | "session_info";

export interface SessionTreeNodeSnapshot {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: SessionTreeNodeKind;
  readonly timestamp: Timestamp;
  readonly label?: string;
  readonly role?: string;
  readonly customType?: string;
  readonly title: string;
  readonly preview?: string;
  readonly children: readonly SessionTreeNodeSnapshot[];
}

export interface SessionTreeSnapshot {
  readonly roots: readonly SessionTreeNodeSnapshot[];
  readonly leafId: string | null;
}

export interface NavigateSessionTreeOptions {
  readonly summarize?: boolean;
  readonly customInstructions?: string;
}

export interface NavigateSessionTreeResult {
  readonly cancelled: boolean;
  readonly aborted?: boolean;
  readonly editorText?: string;
  readonly summaryCreated?: boolean;
}

// ── Attachments ──

export interface SessionImageAttachment {
  readonly kind: "image";
  readonly mimeType: string;
  readonly data: string;
  readonly name?: string;
}

export interface SessionFileAttachment {
  readonly kind: "file";
  readonly name: string;
  readonly mimeType: string;
  readonly fsPath: string;
  readonly sizeBytes?: number;
}

export type SessionAttachment = SessionImageAttachment | SessionFileAttachment;

// ── Message Input ──

export interface SessionMessageInput {
  readonly text: string;
  readonly attachments?: readonly SessionAttachment[];
  readonly deliverAs?: SessionMessageDeliveryMode;
}

export interface CreateSessionOptions {
  readonly title?: string;
  readonly initialModel?: SessionModelSelection;
  readonly initialThinkingLevel?: string;
}

// ── Model ──

export interface SessionModelSelection {
  readonly provider: string;
  readonly modelId: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

// ── Host UI Requests ──

export type HostUiResponse =
  | {
      readonly requestId: string;
      readonly value: string;
    }
  | {
      readonly requestId: string;
      readonly confirmed: boolean;
    }
  | {
      readonly requestId: string;
      readonly cancelled: true;
    };

export type HostUiRequest =
  | {
      readonly kind: "confirm";
      readonly requestId: string;
      readonly title: string;
      readonly message: string;
      readonly defaultValue?: boolean;
      readonly timeoutMs?: number;
    }
  | {
      readonly kind: "input";
      readonly requestId: string;
      readonly title: string;
      readonly placeholder?: string;
      readonly initialValue?: string;
      readonly timeoutMs?: number;
    }
  | {
      readonly kind: "select";
      readonly requestId: string;
      readonly title: string;
      readonly options: readonly string[];
      readonly allowMultiple?: boolean;
      readonly timeoutMs?: number;
    }
  | {
      readonly kind: "editor";
      readonly requestId: string;
      readonly title: string;
      readonly initialValue?: string;
    }
  | {
      readonly kind: "notify";
      readonly requestId: string;
      readonly message: string;
      readonly level?: "info" | "warning" | "error";
    }
  | {
      readonly kind: "status";
      readonly requestId: string;
      readonly key: string;
      readonly text?: string;
    }
  | {
      readonly kind: "widget";
      readonly requestId: string;
      readonly key: string;
      readonly lines?: readonly string[];
      readonly placement?: "aboveComposer" | "belowComposer";
    }
  | {
      readonly kind: "title";
      readonly requestId: string;
      readonly title: string;
    }
  | {
      readonly kind: "editorText";
      readonly requestId: string;
      readonly text: string;
    }
  | {
      readonly kind: "reset";
      readonly requestId: string;
    };

// ── Session Events ──

export interface SessionEventBase {
  readonly type: string;
  readonly sessionRef: SessionRef;
  readonly timestamp: Timestamp;
  readonly runId?: RunId;
}

export interface SessionOpenedEvent extends SessionEventBase {
  readonly type: "sessionOpened";
  readonly snapshot: SessionSnapshot;
}

export interface SessionUpdatedEvent extends SessionEventBase {
  readonly type: "sessionUpdated";
  readonly snapshot: SessionSnapshot;
}

export interface AssistantDeltaEvent extends SessionEventBase {
  readonly type: "assistantDelta";
  readonly text: string;
}

export interface QueuedMessageStartedEvent extends SessionEventBase {
  readonly type: "queuedMessageStarted";
  readonly message: SessionQueuedMessage;
}

export interface ToolStartedEvent extends SessionEventBase {
  readonly type: "toolStarted";
  readonly toolName: string;
  readonly callId: string;
  readonly input?: unknown;
}

export interface ToolUpdatedEvent extends SessionEventBase {
  readonly type: "toolUpdated";
  readonly callId: string;
  readonly text?: string;
  readonly progress?: number;
}

export interface ToolFinishedEvent extends SessionEventBase {
  readonly type: "toolFinished";
  readonly callId: string;
  readonly success: boolean;
  readonly output?: unknown;
}

export interface RunCompletedEvent extends SessionEventBase {
  readonly type: "runCompleted";
  readonly snapshot: SessionSnapshot;
}

export interface SessionErrorInfo {
  readonly message: string;
  readonly code?: string;
  readonly details?: unknown;
}

export interface RunFailedEvent extends SessionEventBase {
  readonly type: "runFailed";
  readonly error: SessionErrorInfo;
}

export interface HostUiRequestEvent extends SessionEventBase {
  readonly type: "hostUiRequest";
  readonly request: HostUiRequest;
}

export interface SessionClosedEvent extends SessionEventBase {
  readonly type: "sessionClosed";
  readonly reason: "manual" | "ended" | "failed";
}

export type SessionDriverEvent =
  | SessionOpenedEvent
  | SessionUpdatedEvent
  | AssistantDeltaEvent
  | QueuedMessageStartedEvent
  | ToolStartedEvent
  | ToolUpdatedEvent
  | ToolFinishedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | HostUiRequestEvent
  | SessionClosedEvent;

// ── RPC Events (from pi's stdout) ──

export interface ImageContent {
  type: 'image'
  data: string
  mimeType: string
}

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

// ── Session Info (Legacy) ──

export interface SessionInfo {
  id: string
  path: string
  name?: string
  cwd: string
  createdAt: string
  messageCount: number
}

// ── Command Info ──

export interface CommandInfo {
  name: string
  description: string
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

// ── Session Driver Interface ──

export type SessionEventListener = (event: SessionDriverEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface SessionDriver {
  createSession(workspace: WorkspaceRef, options?: CreateSessionOptions): Promise<SessionSnapshot>;
  openSession(sessionRef: SessionRef): Promise<SessionSnapshot>;
  archiveSession(sessionRef: SessionRef): Promise<void>;
  unarchiveSession(sessionRef: SessionRef): Promise<void>;
  sendUserMessage(sessionRef: SessionRef, input: SessionMessageInput): Promise<void>;
  replaceQueuedMessages(sessionRef: SessionRef, messages: readonly SessionQueuedMessage[]): Promise<void>;
  cancelCurrentRun(sessionRef: SessionRef): Promise<void>;
  setSessionModel(sessionRef: SessionRef, selection: SessionModelSelection): Promise<void>;
  setSessionThinkingLevel(sessionRef: SessionRef, thinkingLevel: string): Promise<void>;
  renameSession(sessionRef: SessionRef, title: string): Promise<void>;
  compactSession(sessionRef: SessionRef, customInstructions?: string): Promise<void>;
  reloadSession(sessionRef: SessionRef): Promise<void>;
  getSessionTree(sessionRef: SessionRef): Promise<SessionTreeSnapshot>;
  navigateSessionTree(
    sessionRef: SessionRef,
    targetId: string,
    options?: NavigateSessionTreeOptions,
  ): Promise<NavigateSessionTreeResult>;
  respondToHostUiRequest(sessionRef: SessionRef, response: HostUiResponse): Promise<void>;
  subscribe(sessionRef: SessionRef, listener: SessionEventListener): Unsubscribe;
  closeSession(sessionRef: SessionRef): Promise<void>;
}
