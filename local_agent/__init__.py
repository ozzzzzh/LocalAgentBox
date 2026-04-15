"""
Local Agent Client - 本地 Agent 客户端
提供文件操作、代码补全、编辑器集成等能力
"""

from .client import LocalAgentClient
from .protocol import Message
from .tool_registry import Tool, ToolRegistry
from .file_tools import FileTools
from .code_completion import CodeCompletionEngine, CompletionItem
from .editor_integration import EditorManager, VSCodeIntegration, CursorIntegration

__all__ = [
    "LocalAgentClient",
    "Message",
    "Tool",
    "ToolRegistry",
    "FileTools",
    "CodeCompletionEngine",
    "CompletionItem",
    "EditorManager",
    "VSCodeIntegration",
    "CursorIntegration",
]

__version__ = "0.1.0"
