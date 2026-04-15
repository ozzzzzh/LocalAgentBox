"""
消息协议定义
"""

from dataclasses import dataclass, field
from typing import Literal, Any, Optional
import json
import uuid


@dataclass
class Message:
    """WebSocket 消息协议"""

    type: Literal[
        "file.read",      # 读取文件
        "file.write",     # 写入文件
        "file.list",      # 列目录
        "file.delete",    # 删除文件
        "file.exists",    # 检查文件是否存在
        "code.complete",  # 代码补全请求
        "code.diagnose",  # 代码诊断
        "code.format",    # 代码格式化
        "shell.execute",  # 执行命令
        "editor.open",    # 打开文件到编辑器
        "editor.goto",    # 跳转到位置
        "editor.get_info",# 获取编辑器当前信息
        "capabilities",   # 能力声明
        "tool.call",      # 工具调用请求
        "response",       # 响应
        "error",          # 错误
        "ping",           # 心跳请求
        "pong",           # 心跳响应
    ]
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    payload: dict = field(default_factory=dict)

    def to_json(self) -> str:
        """序列化为 JSON 字符串"""
        return json.dumps({
            "type": self.type,
            "id": self.id,
            "payload": self.payload
        }, ensure_ascii=False)

    @classmethod
    def from_json(cls, data: str) -> "Message":
        """从 JSON 字符串解析"""
        d = json.loads(data)
        return cls(type=d["type"], id=d.get("id", ""), payload=d.get("payload", {}))

    @classmethod
    def create_response(cls, request_id: str, payload: dict) -> "Message":
        """创建响应消息"""
        return cls(type="response", id=request_id, payload=payload)

    @classmethod
    def create_error(cls, request_id: str, error_msg: str, error_code: Optional[str] = None) -> "Message":
        """创建错误消息"""
        payload = {"error": error_msg}
        if error_code:
            payload["error_code"] = error_code
        return cls(type="error", id=request_id, payload=payload)


@dataclass
class ToolCallRequest:
    """工具调用请求"""
    tool: str
    params: dict
    request_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def to_message(self) -> Message:
        return Message(
            type="tool.call",
            id=self.request_id,
            payload={"tool": self.tool, "params": self.params}
        )
