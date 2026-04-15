"""
本地 Agent 客户端
整合所有能力，连接到云端 Gateway
"""

import asyncio
import json
import ssl
from typing import Optional, Callable, Awaitable
from pathlib import Path

import websockets
from websockets.client import WebSocketClientProtocol

from .protocol import Message, ToolCallRequest
from .tool_registry import Tool, ToolRegistry, ToolBuilder
from .file_tools import FileTools
from .code_completion import CodeCompletionEngine, DiagnosticsEngine
from .editor_integration import EditorManager


class LocalAgentClient:
    """
    本地 Agent 客户端

    功能:
    - 连接到云端 Gateway
    - 声明本地能力
    - 响应工具调用请求
    - 支持文件操作、代码补全、编辑器集成等
    """

    def __init__(
        self,
        gateway_url: str,
        workspace: str,
        use_tls: bool = False,
        api_key: Optional[str] = None,
        client_id: Optional[str] = None,
    ):
        """
        初始化客户端

        Args:
            gateway_url: Gateway 地址 (ws:// 或 wss://)
            workspace: 工作区路径
            use_tls: 是否使用 TLS
            api_key: API 密钥（用于认证）
            client_id: 客户端 ID（可选，用于标识）
        """
        self.gateway_url = gateway_url
        self.workspace = str(Path(workspace).resolve())
        self.use_tls = use_tls
        self.api_key = api_key
        self.client_id = client_id or "local-agent"

        self.ws: Optional[WebSocketClientProtocol] = None
        self._running = False
        self._reconnect = True
        self._reconnect_delay = 5
        self._max_reconnect_delay = 60

        # 初始化各模块
        self.file_tools = FileTools(self.workspace)
        self.code_engine = CodeCompletionEngine(self.workspace)
        self.diagnostics_engine = DiagnosticsEngine()
        self.editor_manager = EditorManager()
        self.tool_registry = ToolRegistry()

        # 消息处理器
        self._message_handlers: dict[str, Callable] = {}

        # 注册内置工具
        self._register_builtin_tools()

    def _register_builtin_tools(self):
        """注册内置工具"""

        # ===== 文件操作工具 =====

        self.tool_registry.register(
            ToolBuilder("file.read")
            .description("读取文件内容")
            .param("path", "string", "文件路径", required=True)
            .param("encoding", "string", "文件编码", required=False, default="utf-8")
            .handler(self._handle_file_read)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("file.write")
            .description("写入文件内容")
            .param("path", "string", "文件路径", required=True)
            .param("content", "string", "文件内容", required=True)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("file.list")
            .description("列出目录内容")
            .param("path", "string", "目录路径", required=False, default=".")
            .param("recursive", "boolean", "是否递归", required=False, default=False)
            .handler(self._handle_file_list)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("file.delete")
            .description("删除文件或目录")
            .param("path", "string", "路径", required=True)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("file.exists")
            .description("检查路径是否存在")
            .param("path", "string", "路径", required=True)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("file.info")
            .description("获取文件详细信息")
            .param("path", "string", "文件路径", required=True)
            .handler(self._handle_file_info)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("file.search")
            .description("搜索文件")
            .param("pattern", "string", "glob 模式", required=True)
            .param("path", "string", "搜索目录", required=False, default=".")
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("file.move")
            .description("移动或重命名文件")
            .param("src", "string", "源路径", required=True)
            .param("dst", "string", "目标路径", required=True)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("file.copy")
            .description("复制文件")
            .param("src", "string", "源路径", required=True)
            .param("dst", "string", "目标路径", required=True)
            .build()
        )

        # ===== 代码补全工具 =====

        self.tool_registry.register(
            ToolBuilder("code.complete")
            .description("获取代码补全建议")
            .param("file_path", "string", "文件路径", required=True)
            .param("line", "integer", "行号 (0-based)", required=True)
            .param("column", "integer", "列号 (0-based)", required=True)
            .handler(self._handle_code_complete)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("code.diagnose")
            .description("获取代码诊断信息")
            .param("file_path", "string", "文件路径", required=True)
            .handler(self._handle_code_diagnose)
            .build()
        )

        # ===== 编辑器操作工具 =====

        self.tool_registry.register(
            ToolBuilder("editor.open")
            .description("在编辑器中打开文件")
            .param("file_path", "string", "文件路径", required=True)
            .param("line", "integer", "行号", required=False, default=0)
            .param("column", "integer", "列号", required=False, default=0)
            .handler(self._handle_editor_open)
            .build()
        )

        self.tool_registry.register(
            ToolBuilder("editor.list")
            .description("列出可用的编辑器")
            .handler(self._handle_editor_list)
            .build()
        )

        # ===== 工作区工具 =====

        self.tool_registry.register(
            ToolBuilder("workspace.info")
            .description("获取工作区信息")
            .handler(self._handle_workspace_info)
            .build()
        )

    # ===== 工具处理器 =====

    async def _handle_file_read(self, path: str, encoding: str = "utf-8") -> dict:
        try:
            content = await self.file_tools.read_file(path, encoding)
            return {"success": True, "content": content, "path": path}
        except FileNotFoundError:
            return {"success": False, "error": f"文件不存在: {path}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_file_write(self, path: str, content: str) -> dict:
        try:
            bytes_written = await self.file_tools.write_file(path, content)
            return {"success": True, "bytes_written": bytes_written, "path": path}
        except PermissionError:
            return {"success": False, "error": f"无权限写入: {path}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_file_list(self, path: str = ".", recursive: bool = False) -> dict:
        try:
            items = await self.file_tools.list_directory(path, recursive)
            return {"success": True, "items": items, "path": path}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_file_delete(self, path: str) -> dict:
        try:
            await self.file_tools.delete(path)
            return {"success": True, "path": path}
        except FileNotFoundError:
            return {"success": False, "error": f"路径不存在: {path}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_file_exists(self, path: str) -> dict:
        try:
            result = await self.file_tools.exists(path)
            return {"success": True, **result}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_file_info(self, path: str) -> dict:
        try:
            info = await self.file_tools.get_info(path)
            return {"success": True, **info}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_file_search(self, pattern: str, path: str = ".") -> dict:
        try:
            results = await self.file_tools.search(pattern, path)
            return {"success": True, "results": results}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_code_complete(self, file_path: str, line: int, column: int) -> dict:
        try:
            # 先读取文件内容
            content = await self.file_tools.read_file(file_path)

            # 获取补全建议
            completions = await self.code_engine.complete(file_path, content, line, column)

            return {
                "success": True,
                "completions": [c.to_dict() for c in completions],
                "file_path": file_path,
                "line": line,
                "column": column,
            }
        except FileNotFoundError:
            return {"success": False, "error": f"文件不存在: {file_path}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_code_diagnose(self, file_path: str) -> dict:
        try:
            content = await self.file_tools.read_file(file_path)
            diagnostics = await self.diagnostics_engine.diagnose(file_path, content)
            return {
                "success": True,
                "diagnostics": diagnostics,
                "file_path": file_path,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_editor_open(self, file_path: str, line: int = 0, column: int = 0) -> dict:
        try:
            # 转换为绝对路径
            abs_path = str(Path(self.workspace) / file_path) if not Path(file_path).is_absolute() else file_path

            success = await self.editor_manager.open_file(abs_path, line, column)
            return {
                "success": success,
                "file_path": abs_path,
                "line": line,
                "column": column,
                "editor": self.editor_manager.primary_editor,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_editor_list(self) -> dict:
        try:
            available = await self.editor_manager.detect_available_editors()
            return {
                "success": True,
                "available_editors": available,
                "primary_editor": self.editor_manager.primary_editor,
                "all_editors": self.editor_manager.list_editors(),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _handle_workspace_info(self) -> dict:
        return {
            "success": True,
            "workspace": self.workspace,
            "client_id": self.client_id,
            "tools": self.tool_registry.list_tool_names(),
        }

    # ===== WebSocket 连接与消息处理 =====

    async def connect(self):
        """连接到 Gateway"""
        ssl_context = None
        if self.use_tls or self.gateway_url.startswith("wss://"):
            ssl_context = ssl.create_default_context()
            # 如果需要信任自签名证书:
            # ssl_context.check_hostname = False
            # ssl_context.verify_mode = ssl.CERT_NONE

        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        self._running = True

        while self._running and self._reconnect:
            try:
                async with websockets.connect(
                    self.gateway_url,
                    ssl=ssl_context,
                    extra_headers=headers,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    self.ws = ws
                    print(f"[{self.client_id}] 已连接到 {self.gateway_url}")

                    # 发送能力声明
                    await self._send_capabilities()

                    # 重置重连延迟
                    self._reconnect_delay = 5

                    # 消息循环
                    async for message in ws:
                        try:
                            await self._handle_message(message)
                        except Exception as e:
                            print(f"处理消息错误: {e}")
                            await self._send_error("unknown", str(e))

            except websockets.exceptions.ConnectionClosed:
                print(f"[{self.client_id}] 连接已关闭")
            except ConnectionRefusedError:
                print(f"[{self.client_id}] 连接被拒绝")
            except Exception as e:
                print(f"[{self.client_id}] 连接错误: {e}")

            # 重连逻辑
            if self._running and self._reconnect:
                print(f"[{self.client_id}] {self._reconnect_delay}秒后重连...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, self._max_reconnect_delay)

    async def disconnect(self):
        """断开连接"""
        self._running = False
        if self.ws:
            await self.ws.close()

    async def _send_capabilities(self):
        """向 Gateway 声明本客户端的能力"""
        capabilities = {
            "type": "capabilities",
            "id": self.client_id,
            "payload": {
                "client_id": self.client_id,
                "workspace": self.workspace,
                "tools": self.tool_registry.list_tools(),
            }
        }
        await self.ws.send(json.dumps(capabilities))

    async def _handle_message(self, raw_message: str):
        """处理来自 Gateway 的消息"""
        try:
            data = json.loads(raw_message)
            msg_type = data.get("type")
            msg_id = data.get("id", "unknown")
            payload = data.get("payload", {})

            # 分发到对应处理器
            if msg_type == "tool.call":
                await self._handle_tool_call(msg_id, payload)
            elif msg_type == "ping":
                await self._send_pong(msg_id)
            elif msg_type in self._message_handlers:
                handler = self._message_handlers[msg_type]
                await handler(msg_id, payload)
            else:
                print(f"未知消息类型: {msg_type}")

        except json.JSONDecodeError:
            await self._send_error("unknown", "无效的 JSON 格式")
        except Exception as e:
            await self._send_error("unknown", str(e))

    async def _handle_tool_call(self, msg_id: str, payload: dict):
        """处理工具调用请求"""
        tool_name = payload.get("tool")
        tool_params = payload.get("params", {})

        result = await self.tool_registry.execute(tool_name, tool_params)

        response = Message.create_response(msg_id, result)
        await self.ws.send(response.to_json())

    async def _send_pong(self, ping_id: str):
        """发送心跳响应"""
        pong = Message(type="pong", id=ping_id)
        await self.ws.send(pong.to_json())

    async def _send_error(self, msg_id: str, error_msg: str):
        """发送错误响应"""
        error = Message.create_error(msg_id, error_msg)
        await self.ws.send(error.to_json())

    # ===== 公共 API =====

    def register_tool(self, tool: Tool):
        """注册自定义工具"""
        self.tool_registry.register(tool)

    def register_message_handler(self, msg_type: str, handler: Callable[[str, dict], Awaitable[None]]):
        """注册自定义消息处理器"""
        self._message_handlers[msg_type] = handler

    def set_reconnect(self, enabled: bool):
        """设置是否自动重连"""
        self._reconnect = enabled


async def run_client(
    gateway_url: str,
    workspace: str,
    use_tls: bool = False,
    api_key: Optional[str] = None,
    client_id: Optional[str] = None,
):
    """便捷函数：运行客户端"""
    client = LocalAgentClient(
        gateway_url=gateway_url,
        workspace=workspace,
        use_tls=use_tls,
        api_key=api_key,
        client_id=client_id,
    )
    await client.connect()
