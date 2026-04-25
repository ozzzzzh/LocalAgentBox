# OpenClaw Gateway 帧协议

## 概述

OpenClaw Gateway 使用基于 WebSocket 的 JSON 帧协议通信，采用 `req/res/event` 三种帧类型。连接建立后，Gateway 会先发送 `connect.challenge` 事件（含 nonce），客户端**必须等待此事件后再发送 `connect` 握手帧**，否则会被 1008 关闭。协议版本必须为 3（`maxProtocol >= 3`），否则返回 1002 `protocol mismatch`。

## 帧格式

### 请求帧 (Request Frame)

```json
{
  "type": "req",
  "id": "唯一ID",
  "method": "方法名",
  "params": {}
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | `"req"` | 是 | 固定值 |
| id | string | 是 | 唯一请求 ID（UUID） |
| method | string | 是 | 方法名，如 `"connect"`、`"node.invoke"` |
| params | any | 否 | 方法参数 |

### 响应帧 (Response Frame)

```json
{
  "type": "res",
  "id": "对应请求的ID",
  "ok": true,
  "payload": {},
  "error": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | `"res"` | 是 | 固定值 |
| id | string | 是 | 对应请求帧的 ID |
| ok | boolean | 是 | 是否成功 |
| payload | any | 否 | 成功时的返回数据 |
| error | object | 否 | 失败时的错误信息 |

错误格式：
```json
{
  "code": "ERROR_CODE",
  "message": "错误描述"
}
```

### 事件帧 (Event Frame)

```json
{
  "type": "event",
  "event": "事件名",
  "payload": {},
  "seq": 1,
  "stateVersion": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | `"event"` | 是 | 固定值 |
| event | string | 是 | 事件名 |
| payload | any | 否 | 事件数据 |
| seq | integer | 否 | 事件序号 |
| stateVersion | any | 否 | 状态版本 |

## 握手流程

连接 WebSocket 后，流程如下：

1. **Gateway 发送 `connect.challenge` 事件**（含 nonce）
2. **客户端发送 `connect` 请求帧**（必须等待 challenge 事件）
3. **Gateway 响应 connect 结果**

> ⚠️ **关键点**：
> - 协议版本必须为 3：`maxProtocol >= 3` 且 `minProtocol <= 3`，否则返回 1002 `protocol mismatch`
> - 如果第一条消息不是 `connect` 帧，返回 1008 `invalid request frame`
> - `operator` 角色 + token 认证可以跳过设备身份验证（不需要 `device` 字段）

### connect.challenge 事件

连接建立后，Gateway 立即发送：

```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": {
    "nonce": "UUID格式的随机字符串",
    "ts": 1713884800000
  }
}
```

客户端需要提取 `nonce` 用于后续认证（设备认证时需要）。

### connect 参数

```json
{
  "type": "req",
  "id": "随机UUID",
  "method": "connect",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 3,
    "client": {
      "id": "客户端ID",
      "mode": "客户端模式",
      "version": "版本号",
      "platform": "平台",
      "displayName": "显示名称",
      "deviceFamily": "设备系列（可选）",
      "modelIdentifier": "设备型号（可选）",
      "instanceId": "实例ID（可选）"
    },
    "auth": {
      "token": "认证令牌"
    },
    "caps": ["tool-events"],
    "commands": ["可选的命令列表"],
    "role": "operator",
    "scopes": ["可选的作用域"],
    "device": {
      "id": "设备ID",
      "publicKey": "公钥",
      "signature": "签名",
      "signedAt": 0,
      "nonce": "从connect.challenge获取的nonce"
    }
  }
}
```

### 客户端 ID 枚举

| ID | 说明 |
|----|------|
| `webchat-ui` | Web 聊天界面 |
| `openclaw-control-ui` | 控制台 UI |
| `openclaw-tui` | 终端 UI |
| `webchat` | Web 聊天后端 |
| `cli` | 命令行客户端 |
| `gateway-client` | Gateway 客户端 |
| `openclaw-macos` | macOS 客户端 |
| `openclaw-ios` | iOS 客户端 |
| `openclaw-android` | Android 客户端 |
| `node-host` | 节点宿主 |
| `test` | 测试客户端 |
| `fingerprint` | 指纹客户端 |
| `openclaw-probe` | 探针客户端 |

### 客户端模式枚举

| 模式 | 说明 |
|------|------|
| `webchat` | Web 聊天 |
| `cli` | 命令行 |
| `ui` | 控制台界面 |
| `backend` | 后端服务 |
| `node` | 节点 |
| `probe` | 探针 |
| `test` | 测试 |

### 客户端能力 (caps)

| 能力 | 说明 |
|------|------|
| `tool-events` | 接收工具调用事件 |

### 认证方式

`auth` 对象根据 Gateway 配置的认证模式选择：

```json
// Token 模式
{ "auth": { "token": "共享密钥" } }

// Password 模式
{ "auth": { "password": "密码" } }

// 设备认证
{ "auth": { "deviceToken": "设备令牌", "bootstrapToken": "引导令牌" } }
```

## 可用方法列表

### 通信与会话

| 方法 | 说明 | 作用域 |
|------|------|--------|
| `send` | 发送消息 | write |
| `poll` | 发起投票 | write |
| `agent` | 调用 Agent | write |
| `agent.identity.get` | 获取 Agent 身份 | read |
| `agent.wait` | 等待 Agent 响应 | read |
| `chat.send` | 发送聊天消息 | write |
| `chat.history` | 获取聊天历史 | read |
| `chat.abort` | 中止聊天 | write |
| `chat.inject` | 注入聊天消息 | write |

### 会话管理

| 方法 | 说明 |
|------|------|
| `sessions.list` | 列出会话 |
| `sessions.get` | 获取会话详情 |
| `sessions.preview` | 预览会话 |
| `sessions.create` | 创建会话 |
| `sessions.resolve` | 解析会话 |
| `sessions.delete` | 删除会话 |
| `sessions.abort` | 中止会话 |
| `sessions.patch` | 更新会话 |
| `sessions.reset` | 重置会话 |
| `sessions.compact` | 压缩会话 |
| `sessions.usage` | 获取使用量 |
| `sessions.messages.subscribe` | 订阅会话消息 |
| `sessions.messages.unsubscribe` | 取消订阅 |

### 节点管理

| 方法 | 说明 |
|------|------|
| `node.list` | 列出已连接节点 |
| `node.describe` | 获取节点详情 |
| `node.rename` | 重命名节点 |
| `node.invoke` | 调用节点命令 |
| `node.invoke.result` | 返回节点命令结果（节点角色） |
| `node.event` | 发送节点事件（节点角色） |
| `node.pair.request` | 请求节点配对 |
| `node.pair.approve` | 批准节点配对 |
| `node.pair.reject` | 拒绝节点配对 |
| `node.pair.verify` | 验证节点配对 |
| `node.pair.list` | 列出节点配对 |
| `node.pending.enqueue` | 入队待处理任务 |
| `node.pending.drain` | 排出待处理任务 |
| `node.pending.ack` | 确认待处理任务 |

### 工具

| 方法 | 说明 |
|------|------|
| `tools.catalog` | 获取工具目录 |
| `tools.effective` | 获取生效的工具列表 |

### Agent 管理

| 方法 | 说明 |
|------|------|
| `agents.list` | 列出 Agent |
| `agents.create` | 创建 Agent |
| `agents.update` | 更新 Agent |
| `agents.delete` | 删除 Agent |
| `agents.files.list` | 列出 Agent 文件 |
| `agents.files.get` | 获取 Agent 文件 |
| `agents.files.set` | 设置 Agent 文件 |

### 配置

| 方法 | 说明 |
|------|------|
| `config.get` | 获取配置 |
| `config.set` | 设置配置 |
| `config.apply` | 应用配置 |
| `config.patch` | 补丁配置 |
| `config.schema` | 获取配置 Schema |
| `config.schema.lookup` | 查找配置 Schema |

### 定时任务

| 方法 | 说明 |
|------|------|
| `cron.list` | 列出定时任务 |
| `cron.add` | 添加定时任务 |
| `cron.update` | 更新定时任务 |
| `cron.remove` | 删除定时任务 |
| `cron.status` | 获取定时任务状态 |
| `cron.run` | 手动运行定时任务 |
| `cron.runs` | 获取运行记录 |

### 其他

| 方法 | 说明 |
|------|------|
| `models.list` | 列出可用模型 |
| `skills.status` | 技能状态 |
| `skills.search` | 搜索技能 |
| `skills.detail` | 技能详情 |
| `skills.install` | 安装技能 |
| `skills.update` | 更新技能 |
| `skills.bins` | 技能二进制 |
| `channels.status` | 频道状态 |
| `channels.logout` | 频道登出 |
| `push.test` | 推送测试 |
| `logs.tail` | 日志跟踪 |
| `wake` | 唤醒 |
| `talk.speak` | 语音合成 |
| `talk.mode` | 语音模式 |
| `talk.config` | 语音配置 |
| `device.pair.list` | 设备配对列表 |
| `device.pair.approve` | 设备配对批准 |
| `device.pair.reject` | 设备配对拒绝 |
| `device.pair.remove` | 设备配对移除 |
| `device.token.rotate` | 设备令牌轮换 |
| `device.token.revoke` | 设备令牌撤销 |
| `secrets.resolve` | 解析密钥 |
| `secrets.reload` | 重载密钥 |
| `exec.approval.request` | 请求执行审批 |
| `exec.approval.get` | 获取执行审批 |
| `exec.approval.set` | 设置执行审批 |
| `web.login.start` | Web 登录启动 |
| `web.login.wait` | Web 登录等待 |
| `wizard.start` | 向导启动 |
| `wizard.next` | 向导下一步 |
| `wizard.status` | 向导状态 |
| `wizard.cancel` | 向导取消 |
| `location.request` | 请求位置 |

## 关键方法参数

### node.invoke

通过节点调用命令（如文件操作）：

```json
{
  "type": "req",
  "id": "UUID",
  "method": "node.invoke",
  "params": {
    "nodeId": "节点ID",
    "command": "命令名（如 file.read）",
    "params": { "命令参数" },
    "timeoutMs": 30000,
    "idempotencyKey": "幂等键"
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nodeId | string | 是 | 目标节点 ID |
| command | string | 是 | 要执行的命令 |
| params | any | 否 | 命令参数 |
| timeoutMs | integer | 否 | 超时时间（毫秒） |
| idempotencyKey | string | 是 | 幂等键（防止重复执行） |

### node.invoke.result

节点返回命令执行结果：

```json
{
  "type": "req",
  "id": "UUID",
  "method": "node.invoke.result",
  "params": {
    "id": "调用ID",
    "nodeId": "节点ID",
    "ok": true,
    "payload": {},
    "payloadJSON": null,
    "error": null
  }
}
```

### tools.catalog

获取可用工具目录：

```json
{
  "type": "req",
  "id": "UUID",
  "method": "tools.catalog",
  "params": {
    "agentId": "可选，指定Agent",
    "includePlugins": true
  }
}
```

### node.list

列出已连接的节点：

```json
{
  "type": "req",
  "id": "UUID",
  "method": "node.list",
  "params": {}
}
```

## 认证

### Token 模式

Gateway 配置：
```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "共享密钥字符串"
    }
  }
}
```

客户端连接时在 `connect` 帧中携带：
```json
{ "auth": { "token": "共享密钥" } }
```

本地 CLI 从 loopback 连接时，如果使用共享密钥认证且来源是本地回环地址，会自动信任，无需额外设备认证。

### 操作者作用域

| 作用域 | 说明 |
|--------|------|
| `operator.read` | 读取权限 |
| `operator.write` | 写入权限 |
| `operator.admin` | 管理员权限（覆盖所有） |
| `operator.approvals` | 审批权限 |
| `operator.pairing` | 配对权限 |

CLI 默认拥有所有作用域：`["operator.read", "operator.write", "operator.admin", "operator.approvals", "operator.pairing"]`

## 错误码

| 错误码 | 说明 |
|--------|------|
| `INVALID_REQUEST` | 无效请求 |
| 1008 (WebSocket close code) | `invalid request frame` — 握手阶段发送了非 connect 帧 |
| 1008 | `invalid handshake: first request must be connect` — 第一帧不是 connect |
| 1008 | `invalid connect params: ...` — connect 参数校验失败 |

## 典型连接流程

```
客户端                                    Gateway
  │                                         │
  │──── WebSocket 握手 ────────────────────►│
  │                                         │
  │◄─── {type:"event", event:"connect.challenge", payload:{nonce:"..."}} ──│  (Gateway 主动发送)
  │                                         │
  │──── {type:"req", method:"connect"} ────►│  (携带 auth.token, maxProtocol:3)
  │                                         │
  │◄─── {type:"res", ok:true} ─────────────│  (握手成功)
  │                                         │
  │──── {type:"req", method:"tools.catalog"}►│
  │◄─── {type:"res", ok:true, payload:...}─│
  │                                         │
  │──── {type:"req", method:"node.list"} ──►│
  │◄─── {type:"res", ok:true, payload:...}─│
  │                                         │
  │──── {type:"req", method:"node.invoke"}►│  (调用节点命令)
  │◄─── {type:"res", ok:true, payload:...}─│
  │                                         │
  │◄─── {type:"event", event:"..."} ───────│  (服务端推送事件)
  │                                         │
```

## Gateway 配置参考

`~/.openclaw/openclaw.json` 中的 Gateway 配置：

```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback" | "lan" | "tailnet" | "auto" | "custom",
    "auth": {
      "mode": "none" | "token" | "password" | "trusted-proxy",
      "token": "共享密钥",
      "password": "密码"
    },
    "tailscale": {
      "mode": "off" | "on",
      "resetOnExit": false
    }
  }
}
```

### bind 模式

| 值 | 监听地址 | 说明 |
|----|----------|------|
| `loopback` | 127.0.0.1 | 仅本地访问（默认） |
| `lan` | 0.0.0.0 | 局域网可访问 |
| `tailnet` | Tailscale 网络 | 通过 Tailscale 访问 |
| `auto` | 自动选择 | 根据环境决定 |
| `custom` | 自定义 | 需配合其他配置 |

### 常用 CLI 命令

```bash
# 查看 Gateway 状态
openclaw gateway status

# 修改 bind 模式
openclaw gateway config set bind lan

# 修改端口
openclaw gateway config set port 18789

# 重启 Gateway
openclaw gateway restart

# 查看日志
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log
```
