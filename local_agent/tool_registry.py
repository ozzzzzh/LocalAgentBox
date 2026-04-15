"""
工具注册中心
用于注册、管理和执行各种工具
"""

import asyncio
from typing import Callable, Awaitable, Optional, Any, get_type_hints
from dataclasses import dataclass, field
import inspect
import json


@dataclass
class ToolParameter:
    """工具参数定义"""
    name: str
    type: str  # "string", "integer", "number", "boolean", "array", "object"
    description: Optional[str] = None
    required: bool = True
    default: Any = None
    enum: Optional[list] = None  # 枚举值

    def to_json_schema(self) -> dict:
        schema = {"type": self.type}
        if self.description:
            schema["description"] = self.description
        if self.enum:
            schema["enum"] = self.enum
        return schema


@dataclass
class Tool:
    """工具定义"""
    name: str
    handler: Callable[..., Awaitable[dict]]
    description: str
    parameters: list[ToolParameter] = field(default_factory=list)
    returns: Optional[str] = None

    @property
    def parameters_schema(self) -> dict:
        """生成 JSON Schema 格式的参数定义"""
        properties = {}
        required = []

        for param in self.parameters:
            properties[param.name] = param.to_json_schema()
            if param.required:
                required.append(param.name)

        return {
            "type": "object",
            "properties": properties,
            "required": required,
        }

    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters_schema,
            "returns": self.returns,
        }


class ToolRegistry:
    """工具注册中心"""

    def __init__(self):
        self.tools: dict[str, Tool] = {}
        self._aliases: dict[str, str] = {}  # 别名映射

    def register(self, tool: Tool) -> None:
        """注册工具"""
        if tool.name in self.tools:
            raise ValueError(f"工具已存在: {tool.name}")
        self.tools[tool.name] = tool

    def register_alias(self, alias: str, tool_name: str) -> None:
        """注册工具别名"""
        if tool_name not in self.tools:
            raise ValueError(f"工具不存在: {tool_name}")
        self._aliases[alias] = tool_name

    def unregister(self, name: str) -> bool:
        """注销工具"""
        if name in self.tools:
            del self.tools[name]
            return True
        return False

    def get(self, name: str) -> Optional[Tool]:
        """获取工具"""
        # 先查找原名
        if name in self.tools:
            return self.tools[name]
        # 再查找别名
        if name in self._aliases:
            return self.tools[self._aliases[name]]
        return None

    def has(self, name: str) -> bool:
        """检查工具是否存在"""
        return name in self.tools or name in self._aliases

    def list_tools(self) -> list[dict]:
        """列出所有工具"""
        return [tool.to_dict() for tool in self.tools.values()]

    def list_tool_names(self) -> list[str]:
        """列出所有工具名称"""
        return list(self.tools.keys())

    async def execute(self, name: str, params: dict) -> dict:
        """
        执行工具

        Args:
            name: 工具名称
            params: 参数字典

        Returns:
            执行结果
        """
        tool = self.get(name)
        if not tool:
            return {
                "success": False,
                "error": f"未知工具: {name}",
                "error_code": "UNKNOWN_TOOL"
            }

        # 参数校验
        validated_params = self._validate_params(tool, params)
        if "error" in validated_params:
            return {
                "success": False,
                "error": validated_params["error"],
                "error_code": "INVALID_PARAMS"
            }

        try:
            # 执行工具
            result = await tool.handler(**validated_params)

            # 确保结果包含 success 字段
            if "success" not in result:
                result["success"] = True

            return result

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "error_code": "EXECUTION_ERROR"
            }

    def _validate_params(self, tool: Tool, params: dict) -> dict:
        """验证并填充参数"""
        validated = {}

        for param in tool.parameters:
            value = params.get(param.name)

            # 检查必填参数
            if value is None:
                if param.required and param.default is None:
                    return {"error": f"缺少必填参数: {param.name}"}
                value = param.default

            # 类型转换
            if value is not None:
                try:
                    value = self._convert_type(value, param.type)
                except (ValueError, TypeError) as e:
                    return {"error": f"参数 {param.name} 类型错误: {e}"}

            # 枚举值检查
            if param.enum and value not in param.enum:
                return {"error": f"参数 {param.name} 值必须是以下之一: {param.enum}"}

            validated[param.name] = value

        # 添加额外的参数（不校验）
        for key, value in params.items():
            if key not in validated:
                validated[key] = value

        return validated

    def _convert_type(self, value: Any, target_type: str) -> Any:
        """类型转换"""
        if value is None:
            return None

        if target_type == "string":
            return str(value)
        elif target_type == "integer":
            return int(value)
        elif target_type == "number":
            return float(value)
        elif target_type == "boolean":
            if isinstance(value, str):
                return value.lower() in ("true", "1", "yes")
            return bool(value)
        elif target_type == "array":
            if isinstance(value, str):
                return json.loads(value)
            return list(value)
        elif target_type == "object":
            if isinstance(value, str):
                return json.loads(value)
            return dict(value)

        return value


def tool(name: str, description: str):
    """
    工具装饰器

    用法:
        @tool("file.read", "读取文件内容")
        async def read_file(path: str, encoding: str = "utf-8") -> dict:
            ...
    """
    def decorator(func):
        # 解析函数签名
        sig = inspect.signature(func)
        type_hints = get_type_hints(func)

        parameters = []
        for param_name, param in sig.parameters.items():
            if param_name in ("self", "cls"):
                continue

            # 推断类型
            param_type = type_hints.get(param_name, str)
            type_map = {
                str: "string",
                int: "integer",
                float: "number",
                bool: "boolean",
                list: "array",
                dict: "object",
            }
            json_type = type_map.get(param_type, "string")

            # 检查是否有默认值
            has_default = param.default is not inspect.Parameter.empty

            parameters.append(ToolParameter(
                name=param_name,
                type=json_type,
                required=not has_default,
                default=param.default if has_default else None,
            ))

        # 创建 Tool 对象
        tool_obj = Tool(
            name=name,
            description=description,
            parameters=parameters,
            handler=func,
        )

        # 标记函数为工具
        func._is_tool = True
        func._tool = tool_obj

        return func

    return decorator


class ToolBuilder:
    """工具构建器 - 流式创建工具"""

    def __init__(self, name: str):
        self.name = name
        self._description = ""
        self._parameters: list[ToolParameter] = []
        self._handler: Optional[Callable] = None

    def description(self, desc: str) -> "ToolBuilder":
        """设置描述"""
        self._description = desc
        return self

    def param(self, name: str, type: str = "string",
              description: Optional[str] = None,
              required: bool = True, default: Any = None,
              enum: Optional[list] = None) -> "ToolBuilder":
        """添加参数"""
        self._parameters.append(ToolParameter(
            name=name,
            type=type,
            description=description,
            required=required,
            default=default,
            enum=enum,
        ))
        return self

    def handler(self, func: Callable[..., Awaitable[dict]]) -> "ToolBuilder":
        """设置处理函数"""
        self._handler = func
        return self

    def build(self) -> Tool:
        """构建工具"""
        if not self._handler:
            raise ValueError("必须设置 handler")

        return Tool(
            name=self.name,
            description=self._description,
            parameters=self._parameters,
            handler=self._handler,
        )
