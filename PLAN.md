# pi-gui 性能优化计划 - 消除同步阻塞

## 🔴 高优先级 - 直接导致 UI 卡死

### 1. Rust RPC 客户端 stdin 同步写入 (client.rs)
**问题**: `send_command()` 和 `send_extension_ui_response()` 使用同步 `writeln!` + `flush()`，如果 stdin 缓冲区满会阻塞。
```rust
// 当前代码 (client.rs:145-148)
writeln!(stdin, "{}", json).map_err(...)?;
stdin.flush().map_err(...)?;
```
**修复方案**: 
- 使用 `tokio::io::AsyncWriteExt` 异步写入
- 或设置写入超时 (100ms)
- 或使用 channel 发送到独立线程处理

### 2. RPC 锁竞争 - 所有 lock().await 都可能阻塞
**问题**: 多个 Tauri 命令同时调用 `state.rpc.lock().await`，一个卡住全部卡住。
```
model.rs:     lock().await  (set_model, cycle_model, set_thinking_level)
session.rs:   lock().await  (new_session, switch_session, fork)
state.rs:     lock().await  (get_state, get_messages, get_session_stats)
session_driver.rs: lock().await  (6个命令)
```
**修复方案**:
- 所有命令改用 `try_lock()` + 超时
- 或使用 `tokio::sync::Semaphore` 限制并发
- 或分离读写锁

### 3. process.rs - pi 进程启动可能阻塞
**问题**: `rpc.spawn()` 是同步的，如果 pi 启动慢会阻塞 UI。
**修复方案**: 启动操作放到后台 task

---

## 🟡 中优先级 - 可能导致卡顿

### 4. config.rs - 同步文件读写
**问题**: `fs::read_to_string` 是同步阻塞的。
```rust
// config.rs:76, 113
let content = fs::read_to_string(&config_path)?;
```
**修复方案**: 改用 `tokio::fs::read_to_string`

### 5. model.rs - 同步进程调用
**问题**: 虽然用了 `tokio::process::Command`，但命令执行时间可能很长。
**修复方案**: 已有 15s 超时，可以接受

### 6. packages.rs - 同步进程调用
**问题**: `pi install` 和 `pi list-packages` 可能长时间运行。
**修复方案**: 已有异步处理，可以接受

---

## 🟢 低优先级 - 优化项

### 7. 前端 localStorage 频繁写入
**问题**: settings store 每次设置都写入 localStorage。
```typescript
// settings.ts:26, 31, 36, 41, 54
localStorage.setItem('pi-gui:cwd', path)
```
**修复方案**: 
- 添加防抖 (debounce)
- 或批量写入

### 8. 前端 JSON 解析
**问题**: 事件处理中频繁 `JSON.parse`。
**修复方案**: 
- 已有快速路径优化
- 可以考虑 Web Worker 解析

### 9. 前端大量消息渲染
**问题**: 消息列表无限增长，v-for 渲染压力大。
**修复方案**: 
- 虚拟滚动 (virtual scroll)
- 限制显示数量

---

## 📋 执行计划

### Phase 1: 修复阻塞 (立即执行)
| 文件 | 修复内容 | 预期效果 |
|------|---------|---------|
| client.rs | send_command 改异步/超时 | 消除 stdin 写入阻塞 |
| 所有 lock().await | 改 try_lock + 超时 | 消除锁竞争阻塞 |
| process.rs | spawn 改后台 task | 消除启动阻塞 |

### Phase 2: 优化体验 (短期)
| 文件 | 修复内容 | 预期效果 |
|------|---------|---------|
| config.rs | 改 tokio::fs | 文件操作不阻塞 |
| settings.ts | localStorage 防抖 | 减少写入频率 |

### Phase 3: 性能提升 (中期)
| 文件 | 修复内容 | 预期效果 |
|------|---------|---------|
| MessageList.vue | 虚拟滚动 | 大量消息不卡 |
| stores/*.ts | Web Worker 解析 | JS 主线程不阻塞 |

---

## 🔧 技术细节

### 异步 stdin 写入方案
```rust
use tokio::io::AsyncWriteExt;

pub async fn send_command_async(&mut self, command: &RpcCommand) -> Result<(), String> {
    let stdin = self.stdin.as_mut().ok_or("pi stdin not available")?;
    let json = serde_json::to_string(command).map_err(|e| ...)?;
    
    // 设置 100ms 超时
    tokio::time::timeout(
        tokio::time::Duration::from_millis(100),
        stdin.write_all(format!("{}\n", json).as_bytes())
    ).await
    .map_err(|_| "stdin write timeout".to_string())?
    .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    
    Ok(())
}
```

### try_lock + 超时方案
```rust
pub async fn pi_set_model(...) -> Result<(), String> {
    match tokio::time::timeout(
        Duration::from_millis(100),
        state.rpc.lock()
    ).await {
        Ok(Ok(mut rpc)) => {
            let cmd = RpcCommand::SetModel(...);
            rpc.send_command(&cmd)
        }
        Ok(Err(e)) => Err(format!("Lock error: {}", e)),
        Err(_) => Err("Lock timeout".to_string()),
    }
}
```
