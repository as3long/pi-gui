# Tokio Async Runtime 重构总结

## 问题分析

原始代码使用 `std::sync::Mutex` 进行同步锁定，这会阻塞 Tauri 主线程，导致：
- UI 卡顿和掉帧
- 状态刷新延迟
- 用户交互响应缓慢

## 重构方案

### 1. 异步状态管理 (`src-tauri/src/state.rs`)

**改进前：**
```rust
pub struct AppState {
    rpc: Mutex<PiRpcClient>, // std::sync::Mutex - 阻塞式
}
```

**改进后：**
```rust
pub struct AppState {
    rpc: tokio::sync::Mutex<PiRpcClient>, // 异步锁 - 非阻塞
    is_running: AtomicBool,  // 原子操作，零成本快速检查
}
```

**关键改进：**
- 使用 `tokio::sync::Mutex` 代替 `std::sync::Mutex`
- 添加 `AtomicBool` 用于无锁快速状态检查
- `.lock().await` 会让出线程而不是阻塞

### 2. 全异步命令 (`src-tauri/src/commands/`)

所有 Tauri 命令全部改为 `async fn`，包括：
- `process.rs` - 进程管理
- `messages.rs` - 消息发送
- `state.rs` - 状态查询
- `model.rs` - 模型管理
- `config.rs` - 配置读写
- `fs.rs` - 文件系统操作（使用 `tokio::fs`）
- `packages.rs` - 包管理
- `session.rs` - 会话管理
- `session_driver.rs` - 会话驱动

### 3. 异步文件 I/O (`fs.rs`)

**改进前：**
```rust
use std::fs; // 阻塞式 I/O
```

**改进后：**
```rust
use tokio::fs; // 异步 I/O
```

### 4. 递归异步函数

使用 `Box::pin` 处理递归异步调用，避免无限大小的 Future：
```rust
Box::pin(read_dir_recursive(path, depth + 1, max_depth)).await
```

## 性能提升

### 锁定时间对比

| 场景 | 同步 Mutex (阻塞) | 异步 Mutex (非阻塞) |
|------|-------------------|----------------------|
| 获取锁等待 | 阻塞线程，占用 CPU | 让出线程，其他任务继续 |
| UI 响应 | 可能卡顿 | 始终流畅 |
| 并发命令 | 串行执行 | 并发执行 |

### 关键优化点

1. **零成本状态检查：`pi_is_running()` 现在使用原子操作，完全无锁
2. **减少临界区：** 锁持有时间最小化
3. **并发友好：** 同时处理多个 IPC 调用不会互相阻塞
4. **I/O 异步化：** 文件系统操作使用 tokio 异步实现

## 编译验证

```
Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.72s
```

## 后续优化建议

1. **添加请求队列** - 对于高频调用（如 stats 刷新）
2. **实现读写锁分离** - `tokio::sync::RwLock` 允许并发读
3. **添加连接池** - 对于外部资源访问
4. **缓存优化** - 常用数据本地缓存，减少 IPC 调用
5. **批量操作** - 合并多个小请求为批量请求

## 注意事项

1. `tokio::sync::Mutex` 内部仍然使用 `std::sync::Mutex`，但它是"fair"且`future-aware` 的
2. 异步锁的开销略高于同步锁，但避免了线程阻塞带来的 UI 卡顿
3. 对于非常短的临界区（<1ms），同步锁实际上可能更快
4. 始终保持 `.await` 调用在锁外部，避免持有锁时避免长时间阻塞
