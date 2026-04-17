# LocalAgentBox

本地 Agent 客户端，用于连接云端 Gateway，提供文件操作、代码补全、编辑器集成等能力。

## 功能特性

- 文件操作：读取、写入、删除、搜索、复制、移动
- 代码补全：基于 Jedi 的 Python 代码补全
- 代码诊断：语法检查和错误提示
- 编辑器集成：支持 VSCode、Cursor 等
- WebSocket 连接：自动重连、心跳保活

## 目录结构

```
agentBox/
├── main.py              # 入口文件
├── requirements.txt     # Python 依赖
├── local_agent/         # 核心模块
│   ├── client.py        # 客户端实现
│   ├── protocol.py      # 消息协议
│   ├── file_tools.py    # 文件操作工具
│   ├── code_completion.py  # 代码补全
│   ├── editor_integration.py  # 编辑器集成
│   └── tool_registry.py # 工具注册
└── frontend/            # 前端界面
    ├── index.html
    ├── src/
    └── dist/
```

## 安装

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 2. 安装前端依赖（可选）

```bash
cd frontend
npm install
```

## 使用方法

### 启动客户端

```bash
# 基本用法
python main.py

# 指定 Gateway 地址
python main.py --gateway ws://your-gateway:18789

# 指定工作区
python main.py --workspace /path/to/workspace

# 使用 TLS
python main.py --tls

# 指定 API Key
python main.py --api-key your-api-key
```

### 命令行参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--gateway` | `-g` | Gateway 地址 | `ws://localhost:18789` |
| `--workspace` | `-w` | 工作区路径 | 当前目录 |
| `--tls` | `-t` | 使用 TLS (wss://) | False |
| `--api-key` | `-k` | API 密钥 | 环境变量 `AGENT_API_KEY` |
| `--client-id` | `-c` | 客户端 ID | `local-agent` |

### 环境变量

也可以通过环境变量配置：

```bash
export AGENT_GATEWAY_URL=ws://your-gateway:18789
export AGENT_API_KEY=your-api-key
export AGENT_CLIENT_ID=my-agent

python main.py
```

### 启动前端界面

```bash
cd frontend
npm run build   # 编译 TypeScript
npm run serve   # 启动 HTTP 服务器
```

访问 http://localhost:8080

## 内置工具

客户端向 Gateway 声明以下工具能力：

| 工具名 | 说明 |
|--------|------|
| `file.read` | 读取文件内容 |
| `file.write` | 写入文件 |
| `file.list` | 列出目录内容 |
| `file.delete` | 删除文件或目录 |
| `file.exists` | 检查路径是否存在 |
| `file.info` | 获取文件信息 |
| `file.search` | 搜索文件 |
| `file.move` | 移动/重命名文件 |
| `file.copy` | 复制文件 |
| `code.complete` | 代码补全 |
| `code.diagnose` | 代码诊断 |
| `editor.open` | 在编辑器中打开文件 |
| `editor.list` | 列出可用编辑器 |
| `workspace.info` | 获取工作区信息 |

## 扩展开发

### 注册自定义工具

```python
from local_agent import LocalAgentClient, Tool, ToolBuilder

client = LocalAgentClient(...)

# 创建自定义工具
my_tool = (
    ToolBuilder("my.custom_tool")
    .description("自定义工具描述")
    .param("input", "string", "输入参数", required=True)
    .handler(my_handler_function)
    .build()
)

client.register_tool(my_tool)
```

### 注册消息处理器

```python
async def handle_custom_message(msg_id: str, payload: dict):
    print(f"收到消息: {payload}")

client.register_message_handler("custom.event", handle_custom_message)
```

## License

MIT