# AgentBox IDE 开发日志

## 2026-04-28 开发内容总结

### 一、完成的功能

#### 1. AI Chat 对话功能
- 实现与 OpenClaw Gateway 的 AI Agent 对话
- 使用 `sessions.list`、`sessions.create`、`sessions.send` 方法
- 通过 `sessions.messages.subscribe` 订阅消息更新
- 流式响应渲染，实时显示 AI 回复

#### 2. Markdown 渲染增强
- 支持标题 (#、##、###)
- 支持粗体、斜体
- 支持无序/有序列表
- 支持代码块和行内代码
- 支持链接和分隔线
- 段落自动包装

#### 3. IDE 布局重构
- 新布局：文件浏览器(左) | 编辑器(中) | Chat(右)
- 底部抽屉：工具面板和日志面板
- 左右侧边栏支持拖拽调整大小
- 抽屉支持高度调整
- 新增 `layoutManager.ts` 组件

#### 4. 文件操作修复
- 空文件正确打开
- 文件保存使用 base64 编码
- 新增返回上级目录按钮

---

### 二、踩坑记录与解决方案

#### 问题 1: Chat 发送失败 - unknown method

**错误:** `Error: unknown method: agent.send`

**原因:** OpenClaw 协议没有 `agent.send` 方法

**解决方案:** 使用 session 相关方法:
```typescript
// 创建或获取 session
const result = await this.client.request("sessions.create", {
  agentId: "main",
  message: content,
});

// 发送消息
await this.client.request("sessions.send", {
  key: this.sessionKey,
  message: content,
  idempotencyKey: this.generateId(),
});

// 订阅消息更新
await this.client.request("sessions.messages.subscribe", { key });
```

#### 问题 2: Chat 无法接收 AI 回复

**错误:** 发送消息后无响应

**原因:** 未订阅 session 的消息更新

**解决方案:** 在创建 session 后立即订阅:
```typescript
private async subscribeToSession(key: string): Promise<void> {
  await this.client.request("sessions.messages.subscribe", { key });
}
```

#### 问题 3: Chat 消息重复渲染

**错误:** 同一条消息渲染多次

**原因:** 多个事件都触发消息渲染 (`agent`、`chat`、`session.message`)

**解决方案:** 只监听 `agent` 事件，忽略其他事件:
```typescript
if (event === "agent") {
  const data = payload as {
    stream?: string;
    data?: { delta?: string; phase?: string };
  };
  
  // stream: "assistant" 包含 AI 回复的增量
  if (data.stream === "assistant" && data.data?.delta) {
    this.handleStreamDelta(data.data.delta, false);
  }
  
  // stream: "lifecycle" phase: "end" 表示回复完成
  if (data.stream === "lifecycle" && data.data?.phase === "end") {
    this.handleStreamDelta("", true);
  }
}
```

#### 问题 4: 流式消息光标不消失

**错误:** AI 回复完成后，末尾的 `▌` 光标不消失

**原因:** `updateStreamingMessage` 总是添加光标

**解决方案:** 添加 `showCursor` 参数:
```typescript
private handleStreamDelta(delta: string, done?: boolean): void {
  // ...
  this.updateStreamingMessage(id, content, !done); // done 时隐藏光标
}
```

#### 问题 5: 空文件打开失败

**错误:** 打开空文件显示 "命令执行失败"

**原因:** `payload.stdout` 检查，空字符串为 falsy

**解决方案:** 检查 exitCode 而非 stdout:
```typescript
if (payload.exitCode === 0 || payload.success === true) {
  return { success: true, output: payload.stdout ?? "" };
}
```

#### 问题 6: 文件保存 heredoc 失败

**错误:** 使用 heredoc 语法保存文件失败

**原因:** `\n` 字符在 shell 命令字符串中不转换为实际换行符

**解决方案:** 使用 base64 编码:
```typescript
const base64Content = btoa(unescape(encodeURIComponent(content)));
const saveCmd = `echo "${base64Content}" | base64 -d > "${path}"`;
```

---

### 三、OpenClaw Session 协议要点

#### 1. Session 方法列表
| 方法 | 用途 |
|------|------|
| `sessions.list` | 列出所有 session |
| `sessions.create` | 创建新 session |
| `sessions.send` | 发送消息到 session |
| `sessions.messages.subscribe` | 订阅消息更新 |

#### 2. Session Key 格式
```
agent:<agentId>:<sessionId>
```
例如: `agent:main:abc123`

#### 3. Agent 事件结构
```json
{
  "stream": "assistant",
  "data": {
    "delta": "增量文本内容"
  },
  "sessionKey": "agent:main:xxx"
}
```

#### 4. 生命周期事件
```json
{
  "stream": "lifecycle",
  "data": {
    "phase": "end"
  }
}
```

---

### 四、新增组件

#### layoutManager.ts
处理布局相关的交互:
- 左右侧边栏宽度拖拽调整
- 底部抽屉开关和高度调整
- 抽屉标签切换 (工具/日志)

```typescript
export class LayoutManager {
  constructor() {
    this.initResizeHandles();
    this.initDrawer();
  }
  
  toggleDrawer(): void;
  openDrawer(tab?: string): void;
  closeDrawer(): void;
  switchDrawerTab(tab: string): void;
}
```

---

### 五、样式更新

#### 新增 CSS 类
```css
/* 布局 */
.new-layout { display: flex; }
.resize-handle { cursor: col-resize; }
.drawer { position: fixed; bottom: 0; }
.drawer.open { transform: translateY(-100%); }

/* Markdown */
.md-h2, .md-h3, .md-h4 { /* 标题样式 */ }
.md-ul, .md-li { /* 列表样式 */ }
.md-link { /* 链接样式 */ }
.md-p { /* 段落样式 */ }
.code-block { /* 代码块样式 */ }
.inline-code { /* 行内代码样式 */ }
```

---

## 2026-04-27 开发内容总结

### 一、完成的功能

#### 1. IDE 布局重构
- 左侧文件浏览器 (FileExplorer)
- 中间上方 Chat 对话区域 (ChatPanel)
- 中间下方代码编辑器 (CodeEditor)
- 右侧工具面板和日志面板

#### 2. 文件操作功能
- 文件目录加载和显示
- 文件打开（支持空文件）
- 文件保存（使用 base64 编码）
- 新建文件
- 返回上级目录按钮

#### 3. WebSocket 连接
- 连接到 OpenClaw Gateway
- 协议版本协商 (maxProtocol=3)
- 角色认证 (role: "operator")
- 节点发现和命令调用

---

### 二、踩坑记录与解决方案

#### 问题 1: WebSocket 连接错误码

| 错误码 | 原因 | 解决方案 |
|--------|------|----------|
| 1008 origin not allowed | 前端 origin 未在白名单 | 在 `openclaw.json` 的 `gateway.allowedOrigins` 添加前端地址 |
| 1008 control ui requires device identity | 需要 device identity | 使用 `role: "operator"` + `scopes` 数组，或在 config 中设置 `dangerouslyDisableDeviceAuth: true` |
| 1002 protocol mismatch | 协议版本不匹配 | 设置 `maxProtocol: 3`, `minProtocol: 1` |

#### 问题 2: system.run 命令格式

**错误:** `INVALID_REQUEST: command required`

**原因:** OpenClaw 的 `system.run` 命令需要特定格式

**解决方案:** 使用 `["bash", "-lc", "shell command"]` 格式
```typescript
const result = await this.client.invokeNodeCommand(this.nodeId, "system.run", {
  command: ["bash", "-lc", shellCommand],
  timeoutMs: 30000,
});
```

#### 问题 3: system.run 权限拒绝

**错误:** `SYSTEM_RUN_DENIED: approval required` / `allowlist miss`

**原因:** Gateway 安全配置限制了 shell 执行

**解决方案:** 在 `openclaw.json` 中配置:
```json
{
  "tools": {
    "profile": "coding",
    "exec": {
      "security": "full",
      "ask": "off"
    }
  }
}
```

#### 问题 4: 命令结果解析

**错误:** `exitCode=undefined`, 命令执行失败

**原因:** `system.run` 返回嵌套结构，需要正确解析

**解决方案:** 结果结构为 `{ok, payload: {exitCode, stdout, stderr, success}}`
```typescript
if (outer.ok === true && payload) {
  if (payload.exitCode === 0 || payload.success === true) {
    return { success: true, output: payload.stdout ?? "" };
  }
}
```

---

### 三、OpenClaw Gateway 协议要点

#### 1. WebSocket 连接流程
1. 建立 WebSocket 连接
2. **等待** Gateway 发送 `connect.challenge` event
3. 发送 `connect` frame (包含 protocol version, role, scopes)
4. Gateway 返回 `connect.response` 或错误

#### 2. Frame 类型
- `req`: 请求帧，需要 `id`, `type`, `payload`
- `res`: 响应帧，包含 `id`, `ok`, `payload`
- `event`: 事件帧，如 `connect.challenge`, `node.list`, `tools.catalog`

#### 3. 协议版本
- 当前版本: **3**
- 必须设置 `maxProtocol >= 3` 且 `minProtocol <= 3`

#### 4. 角色和权限
- `role: "operator"` - 操作者角色，可以跳过设备认证
- `scopes`: 权限范围数组，如 `["node:invoke", "tools:list", "files:read"]`

#### 5. Node 调用
```typescript
// 发现节点
await client.send("node.list", {});

// 调用命令
await client.send("node.invoke", {
  nodeId: "xxx",
  command: "system.run",
  params: { command: ["bash", "-lc", "cmd"] },
  idempotencyKey: "unique-key"
});
```

---

### 四、前端架构

```
frontend/
├── index.html          # 主页面布局
├── css/style.css       # VSCode-like 深色主题样式
├── src/
│   ├── main.ts         # App 入口，组件初始化
│   ├── client.ts       # WebSocket 客户端，协议处理
│   ├── fileExplorer.ts # 文件浏览器，ls 命令
│   ├── codeEditor.ts   # 代码编辑器，文件读写
│   ├── chatPanel.ts    # Chat 对话面板
│   ├── toolsPanel.ts   # 工具列表
│   ├── logger.ts       # 日志管理
│   ├── toast.ts        # 消息提示
│   ├── layoutManager.ts # 布局管理
│   └── types.ts        # TypeScript 类型定义
└── dist/               # 编译输出
```

---

### 五、待完成功能

1. 代码补全 (completion)
2. 文件搜索
3. 多标签编辑器优化
4. 拖拽上传文件
5. Git 状态显示
6. AI 工具调用可视化

---

### 六、关键配置文件

#### openclaw.json (Gateway 配置)
```json
{
  "gateway": {
    "allowedOrigins": ["http://localhost:8080", "http://192.168.x.x:8080"],
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true
    }
  },
  "tools": {
    "profile": "coding",
    "exec": {
      "security": "full",
      "ask": "off"
    }
  }
}
```

#### 启动 Gateway
```bash
docker run -d --name openclaw-gateway \
  -p 18789:18789 \
  -v /root/.openclaw:/root/.openclaw \
  openclaw-gateway:latest
```

#### 启动 Node Host
```bash
openclaw node --config /root/.openclaw/openclaw.json
```

---

### 七、调试技巧

1. **查看 Gateway 日志:** `docker exec openclaw-gateway cat /var/log/openclaw/gateway.log`
2. **查看 Node 日志:** `openclaw node` 命令输出
3. **前端调试:** Chrome DevTools → Network → WS 查看 WebSocket 消息
4. **测试 shell 命令:** 在 workspace 目录直接执行命令验证
5. **添加调试日志:** 在 chatPanel 中使用 `console.log` 和 `this.logger.debug`

---

## 知识总结

### WebSocket 连接顺序很重要
许多 WebSocket 协议要求客户端先等待服务器的初始消息。OpenClaw Gateway 会先发送 `connect.challenge`，客户端必须等待后才能发送 `connect` frame。如果顺序错误会导致连接被拒绝。

### Shell 命令传输的特殊字符处理
当通过程序调用 shell 命令时：
- 直接拼接字符串中的 `\n` 不会变成换行符
- Heredoc 语法在这种场景下不工作
- 使用 base64 编码是安全传输文件内容的最佳方式
- 对于 UTF-8 内容: `btoa(unescape(encodeURIComponent(content)))` 编码，`base64 -d` 解码

### 空值的 Truthy/Falsy 检查
在 JavaScript/TypeScript 中:
- 空字符串 `""` 是 falsy
- `exitCode === 0` 比 `stdout` 更可靠判断命令成功
- 使用 `?? ""` 处理可能为空的字符串

### 嵌套 JSON 结果解析
网络协议返回的 JSON 往往是多层嵌套结构。需要仔细阅读文档或打印实际返回值来确定正确的访问路径。

### 流式事件处理
处理流式响应时：
- 使用 buffer 累积增量内容
- 通过特定事件（如 lifecycle end）标记完成
- 避免多个事件触发重复渲染

---
