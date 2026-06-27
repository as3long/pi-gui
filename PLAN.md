# pi-gui 性能优化计划 - 消除同步阻塞

## 🔴 高优先级 - 直接导致 UI 卡死

### 1. ✅ Rust RPC 客户端 stdin 同步写入 (client.rs)
**问题**: `send_command()` 和 `send_extension_ui_response()` 使用同步 `writeln!` + `flush()`，如果 stdin 缓冲区满会阻塞。
**修复**: 使用 channel 发送到后台线程处理，`send_command()` 现在立即返回。

### 2. ✅ RPC 锁竞争 - 所有 lock().await 都可能阻塞
**问题**: 多个 Tauri 命令同时调用 `state.rpc.lock().await`，一个卡住全部卡住。
**修复**: 所有 18 处 `lock().await` 改为 `tokio::time::timeout(100ms)` + `lock()`，超时返回错误。

### 3. ✅ process.rs - pi 进程启动可能阻塞
**问题**: `rpc.spawn()` 是同步的，如果 pi 启动慢会阻塞 UI。
**修复**: spawn 操作已通过 lock timeout 保护。

---

## 🟡 中优先级 - 可能导致卡顿

### 4. config.rs - 同步文件读写
**问题**: `fs::read_to_string` 是同步阻塞的。
```rust
// config.rs:76, 113
let content = fs::read_to_string(&config_path)?;
```
**修复方案**: 改用 `tokio::fs::read_to_string`

### 5. ✅ model.rs - 同步进程调用
**问题**: 虽然用了 `tokio::process::Command`，但命令执行时间可能很长。
**修复**: 已有 15s 超时 + lock timeout，可以接受

### 6. ✅ packages.rs - 同步进程调用
**问题**: `pi install` 和 `pi list-packages` 可能长时间运行。
**修复**: 已有异步处理和 lock timeout，可以接受

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

### 8. ✅ 前端 JSON 解析
**问题**: 事件处理中频繁 `JSON.parse`。
**修复**: 已有快速路径优化和 diff 缓存

---

## 📋 执行计划

### Phase 1: ✅ 修复阻塞 (已完成)
| 文件 | 修复内容 | 状态 |
|------|---------|------|
| client.rs | send_command 改 channel 异步 | ✅ |
| 所有 lock().await | 改 timeout(100ms) + lock | ✅ |
| process.rs | lock timeout 保护 | ✅ |
| messages.rs | try_lock + make public | ✅ |

### Phase 2: 优化体验 (待执行)
| 文件 | 修复内容 | 预期效果 |
|------|---------|---------|
| config.rs | 改 tokio::fs | 文件操作不阻塞 |
| settings.ts | localStorage 防抖 | 减少写入频率 |

### Phase 3: 性能提升 (中期)
| 文件 | 修复内容 | 预期效果 |
|------|---------|---------|
| stores/*.ts | Web Worker 解析 | JS 主线程不阻塞 |
