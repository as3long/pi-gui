# Pi GUI - AI Agent Guide

> This document provides comprehensive information for AI agents working with the pi-gui codebase.

---

## 📋 Project Overview

**Pi GUI** is a Tauri-based desktop application that provides a modern GUI for the [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) AI coding assistant.

### Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Vue 3 | 3.5.x |
| Language | TypeScript | 5.6.x |
| State | Pinia | 3.x |
| Build | Vite | 6.x |
| Backend | Rust | 1.75+ |
| Desktop | Tauri | 2.x |
| Architecture | PureMVC | 2.x |

### Key Dependencies

**Frontend:**
- `@tauri-apps/api` - Tauri frontend API (Channel, invoke, events)
- `@tauri-apps/plugin-fs` - File system operations
- `@tauri-apps/plugin-dialog` - Native dialogs
- `codemirror` - Code editor
- `markdown-it` - Markdown rendering
- `highlight.js` - Syntax highlighting

**Backend (Rust):**
- `tauri` - Desktop framework
- `tokio` - Async runtime
- `serde` / `serde_json` - Serialization
- `tracing` - Logging

---

## 🏗️ Architecture

### Communication Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vue)                       │
├─────────────────────────────────────────────────────────────┤
│  App.vue ──→ stores/ ──→ components/                        │
│     │          │              │                              │
│     └──────────┴──────────────┴──────────┐                  │
│                                          │                  │
│                                    bridge.ts                │
│                              (Channel API + invoke)         │
└──────────────────────────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │       Tauri IPC Layer               │
                    │  ┌─────────────────────────────┐   │
                    │  │ Channel<StreamEvent> (stream)│   │
                    │  │ invoke() (commands)          │   │
                    │  └─────────────────────────────┘   │
                    └──────────────────┬──────────────────┘
                                       │
┌──────────────────────────────────────┴──────────────────────┐
│                      Backend (Rust)                         │
├─────────────────────────────────────────────────────────────┤
│  lib.rs ──→ commands/ ──→ rpc/client.rs                     │
│                            (PiRpcClient)                    │
│                                  │                          │
│                            ┌─────┴─────┐                   │
│                            │  Channel   │                   │
│                            │  Events    │                   │
│                            └─────┬─────┘                   │
│                                  │                          │
└──────────────────────────────────┼──────────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   pi process    │
                          │ (stdin/stdout)  │
                          └─────────────────┘
```

### Data Flow

1. **User Input** → `InputArea.vue` → `ChatView.onSend()`
2. **Command** → `bridge.ts` → `invoke('pi_prompt', {...})`
3. **Rust Processing** → `PiRpcClient.send_command()`
4. **Pi Output** → stdout → `read_events_with_channel()` → `Channel.send()`
5. **Frontend Receive** → `channel.onmessage` → `dispatchEvent()`
6. **Store Update** → `chatStore.handleEvent()` → Vue reactivity
7. **UI Render** → Components re-render with new data

---

## 📁 Key Files & Their Roles

### Frontend

| File | Purpose | Key Patterns |
|------|---------|--------------|
| `src/ipc/bridge.ts` | IPC communication hub | Channel API, event dispatch |
| `src/stores/chat.ts` | Chat state management | Streaming throttle, message buffer |
| `src/stores/session.ts` | Session lifecycle | Watchdog, stats refresh |
| `src/components/chat/StreamingMessage.vue` | Real-time streaming display | Debounced rendering, truncation |
| `src/components/common/DiffRenderer.vue` | Diff visualization | Safe thresholds for large text |
| `src/utils/logger.ts` | Append-only logging | Efficient file writes |

### Backend (Rust)

| File | Purpose | Key Patterns |
|------|---------|--------------|
| `src-tauri/src/rpc/client.rs` | Pi process management | Channel streaming, stdin/stdout |
| `src-tauri/src/rpc/protocol.rs` | RPC protocol types | Serde serialization |
| `src-tauri/src/commands/process.rs` | Process commands | Long-running streaming command |
| `src-tauri/src/commands/fs.rs` | File operations | Append, truncate, read |

---

## 🔑 Critical Patterns

### 1. Channel API Streaming (Rust → Frontend)

```typescript
// Frontend: bridge.ts
export async function piStartStreaming(cwd: string): Promise<() => void> {
  const channel = new Channel<StreamEvent>()
  
  channel.onmessage = (event: StreamEvent) => {
    handleRawPayload(event.payload)
  }
  
  await invoke('pi_start_streaming', { cwd, channel })
  return cleanup
}
```

```rust
// Backend: process.rs
#[tauri::command]
pub async fn pi_start_streaming(
    state: tauri::State<'_, AppState>,
    app: AppHandle,
    cwd: String,
    channel: Channel<StreamEvent>,
) -> Result<(), String> {
    // Start pi with channel
    rpc.spawn_with_channel(&cwd, app, channel)?;
    
    // Keep command alive while pi runs
    loop {
        tokio::time::sleep(Duration::from_millis(200)).await;
        if !state.is_pi_running() { break; }
    }
    Ok(())
}
```

### 2. Streaming Throttling (Frontend)

```typescript
// stores/chat.ts - 16ms throttle for streaming updates
const STREAMING_THROTTLE_MS = 16

function updateStreaming(event: RpcEvent) {
  if (!streamingThrottleTimer) {
    streamingMessage.value.text += delta
    streamingThrottleTimer = setTimeout(flushBufferedStreaming, STREAMING_THROTTLE_MS)
  } else {
    bufferedText += delta
  }
}
```

### 3. Display Debounce (Component)

```typescript
// StreamingMessage.vue - 150ms debounce for rendering
const STREAMING_RENDER_INTERVAL = 150

watch(
  () => streamingMessage.value.text,
  () => {
    if (!displayTimer) {
      displayTimer = setTimeout(flushDisplay, STREAMING_RENDER_INTERVAL)
    }
  }
)
```

### 4. Safe Diff Detection

```typescript
// DiffRenderer.vue - Skip expensive operations for large text
const MAX_DIFF_TEXT_CHARS = 50000
const MAX_DIFF_LINES = 2000

const isLargeText = computed(() => {
  return cleanText.value.length > MAX_DIFF_TEXT_CHARS || 
         cleanText.value.split('\n').length > MAX_DIFF_LINES
})

const isDiff = computed(() => {
  if (isLargeText.value) return false  // Skip diff for large text
  // ... diff detection logic
})
```

### 5. Append-only Logging

```typescript
// logger.ts - Efficient logging without read-modify-write
async function flushLogs() {
  const content = logsToWrite.join('\n') + '\n'
  await invoke('append_to_file', { path, content })  // Append only
  currentLogSize += content.length
}
```

---

## ⚠️ Performance Considerations

### Do's

✅ **Use Channel API** for streaming events instead of Tauri events  
✅ **Debounce rendering** at 150ms for streaming content  
✅ **Truncate large outputs** (8KB limit during streaming)  
✅ **Skip expensive operations** for large texts (>50KB)  
✅ **Use append-only file writes** for logs  
✅ **Throttle stats refresh** (8s interval, not 3s)  

### Don'ts

❌ **Don't emit high-frequency events** via `app_handle.emit()`  
❌ **Don't render on every delta** - use debounced display text  
❌ **Don't compute diffs** for texts > 50KB  
❌ **Don't read entire log files** on each flush  
❌ **Don't spam stats requests** - use debounced requests  

---

## 🧪 Testing Checklist

### Streaming Performance
- [ ] Long responses (1000+ lines) don't freeze UI
- [ ] Large tool outputs (bash, read) don't lag
- [ ] Multiple rapid tool calls remain responsive
- [ ] Abort button works when operation is stuck

### Edge Cases
- [ ] Very large file reads (>1MB) handled gracefully
- [ ] Empty messages don't cause errors
- [ ] Rapid session switching works
- [ ] Network errors don't crash app

### UI Responsiveness
- [ ] Input remains focusable during streaming
- [ ] Scroll performance is smooth
- [ ] Status bar updates without lag
- [ ] Settings panel opens/closes quickly

---

## 🔧 Common Tasks

### Adding a New Tauri Command

1. Define command in `src-tauri/src/commands/`:
```rust
#[tauri::command]
pub async fn my_command(
    state: tauri::State<'_, AppState>,
    param: String,
) -> Result<String, String> {
    let mut rpc = super::lock_rpc(&state).await?;
    // ... implementation
    Ok("result".to_string())
}
```

2. Register in `src-tauri/src/lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    commands::my_command,
])
```

3. Add frontend wrapper in `src/ipc/bridge.ts`:
```typescript
export async function myCommand(param: string): Promise<string> {
  return await invoke<string>('my_command', { param })
}
```

### Adding a New Event Handler

1. Define event type in `src-tauri/src/rpc/protocol.rs` (if needed)

2. Emit from Rust:
```rust
channel.send(StreamEvent { payload: json_line }).ok();
```

3. Handle in frontend store:
```typescript
case 'my_event':
  // Handle event
  break
```

### Modifying Streaming Behavior

- **Throttle interval**: `STREAMING_THROTTLE_MS` in `chat.ts`
- **Display debounce**: `STREAMING_RENDER_INTERVAL` in `StreamingMessage.vue`
- **Truncation limit**: `MAX_STREAMING_RESULT_CHARS` in `StreamingMessage.vue`
- **Diff threshold**: `MAX_DIFF_TEXT_CHARS` in `DiffRenderer.vue`

---

## 🐛 Debugging

### Enable Verbose Logging

```typescript
// In browser console
localStorage.setItem('pi-gui:debug', 'true')
```

### Check Log File

```typescript
import { getLogFilePath, getLogContent } from './utils/logger'
const path = await getLogFilePath()
const content = await getLogContent()
console.log('Log:', content)
```

### Monitor IPC Traffic

```typescript
// In bridge.ts, add debug logging
function handleRawPayload(payload: string) {
  console.log('[IPC]', payload.substring(0, 100))  // Log first 100 chars
  // ...
}
```

### Rust Debugging

```bash
# Build with debug symbols
cd src-tauri
RUST_LOG=debug cargo build

# View logs
tail -f ~/.pi-gui/debug.log
```

---

## 📚 Additional Resources

- [Tauri v2 Documentation](https://v2.tauri.app/)
- [Vue 3 Documentation](https://vuejs.org/)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [PureMVC JavaScript](https://github.com/niclasku/puremvc-js-multicore-framework)

---

*Last updated: 2025-06-29*
