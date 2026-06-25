# Pi-GUI 改进计划

基于参考项目 [minghinmatthewlam/pi-gui](https://github.com/minghinmatthewlam/pi-gui) 的架构，我们对 pi-gui 进行了以下改进：

## 1. 完善类型定义 ✅

### 新增核心类型

**src/ipc/types.ts** 现在包含：

```typescript
// 工作区
interface WorkspaceRef {
  readonly workspaceId: WorkspaceId;
  readonly path: string;
  readonly displayName?: string;
}

// 会话引用
interface SessionRef {
  readonly workspaceId: WorkspaceId;
  readonly sessionId: SessionId;
}

// 会话状态
type SessionStatus = "idle" | "running" | "failed";

// 会话快照
interface SessionSnapshot {
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
}

// 会话树节点
interface SessionTreeNodeSnapshot {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: SessionTreeNodeKind;
  readonly timestamp: Timestamp;
  readonly title: string;
  readonly preview?: string;
  readonly children: readonly SessionTreeNodeSnapshot[];
}

// 会话树快照
interface SessionTreeSnapshot {
  readonly roots: readonly SessionTreeNodeSnapshot[];
  readonly leafId: string | null;
}
```

## 2. 会话状态管理 ✅

### Session Store 更新

**src/stores/session.ts** 新增：

- `sessionStatus: Ref<SessionStatus>` - 跟踪会话状态
- `runningRunId: Ref<string | null>` - 当前运行的 run ID
- `sessionSnapshots: Ref<Map<string, SessionSnapshot>>` - 会话快照缓存

### 状态转换

```
agent_start → status = "running"
agent_end → status = "idle"
response.success = false → status = "failed"
```

## 3. 会话树导航 ✅

### 新增 Store 方法

```typescript
// 设置会话树
setSessionTree(tree: SessionTreeSnapshot): void

// 设置当前节点
setCurrentTreeNode(nodeId: string | null): void

// 查找节点
findTreeNode(nodeId: string): SessionTreeNodeSnapshot | null

// 获取节点路径（用于面包屑导航）
getNodePath(nodeId: string): SessionTreeNodeSnapshot[]
```

### 会话树节点类型

```typescript
type SessionTreeNodeKind =
  | "message"              // 用户/助手消息
  | "thinking_level_change" // 思考级别变更
  | "model_change"         // 模型变更
  | "compaction"           // 上下文压缩
  | "branch_summary"       // 分支摘要
  | "custom"               // 自定义节点
  | "label"                // 标签
  | "session_info";        // 会话信息
```

## 4. 工作区概念 ✅

### Workspace Store

```typescript
// 工作区状态
const workspaces = ref<WorkspaceRef[]>([])
const currentWorkspace = ref<WorkspaceRef | null>(null)

// 计算属性
const currentWorkspaceSessions = computed(() => {...})
const archivedSessions = computed(() => {...})
const activeSessions = computed(() => {...})

// 工作区操作
setWorkspaces(list: WorkspaceRef[]): void
addWorkspace(workspace: WorkspaceRef): void
setCurrentWorkspace(workspace: WorkspaceRef | null): void
```

## 5. 事件系统 ✅

### 会话事件类型

```typescript
type SessionDriverEvent =
  | SessionOpenedEvent      // 会话打开
  | SessionUpdatedEvent     // 会话更新
  | AssistantDeltaEvent     // 助手流式输出
  | QueuedMessageStartedEvent // 队列消息开始
  | ToolStartedEvent        // 工具调用开始
  | ToolUpdatedEvent        // 工具调用更新
  | ToolFinishedEvent       // 工具调用完成
  | RunCompletedEvent       // 运行完成
  | RunFailedEvent          // 运行失败
  | HostUiRequestEvent      // UI 请求
  | SessionClosedEvent;     // 会话关闭
```

### 事件监听

```typescript
// 订阅会话事件
subscribe(sessionRef: SessionRef, listener: SessionEventListener): Unsubscribe

// 事件监听器类型
type SessionEventListener = (event: SessionDriverEvent) => void | Promise<void>
```

## 6. IPC Bridge 新命令 ✅

### 会话驱动命令

| 命令 | 描述 |
|------|------|
| `piCreateSession` | 创建新会话 |
| `piOpenSession` | 打开会话 |
| `piArchiveSession` | 归档会话 |
| `piUnarchiveSession` | 取消归档 |
| `piSendUserMessage` | 发送用户消息 |
| `piCancelCurrentRun` | 取消当前运行 |
| `piSetSessionModel` | 设置会话模型 |
| `piSetSessionThinkingLevel` | 设置思考级别 |
| `piRenameSession` | 重命名会话 |
| `piCompactSession` | 压缩会话 |
| `piReloadSession` | 重新加载会话 |
| `piGetSessionTree` | 获取会话树 |
| `piNavigateSessionTree` | 导航会话树 |
| `piRespondToHostUiRequest` | 响应 UI 请求 |
| `piCloseSession` | 关闭会话 |

## 下一步

1. **UI 组件更新** - 更新 SessionTree 组件以支持新的类型系统
2. **工作区选择器** - 添加工作区切换 UI
3. **会话树视图** - 实现会话内消息树导航
4. **事件处理** - 完善事件监听和处理逻辑
5. **持久化** - 实现工作区和会话状态的本地存储

## 参考

- [minghinmatthewlam/pi-gui](https://github.com/minghinmatthewlam/pi-gui)
- [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent)
