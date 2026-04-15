"""
代码补全引擎
支持多种语言和多种后端
"""

import re
import os
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass, field
from abc import ABC, abstractmethod


@dataclass
class CompletionItem:
    """补全项"""
    text: str                           # 补全文本
    display_text: str                   # 显示文本
    kind: str                           # 类型: function, class, variable, keyword, etc.
    detail: Optional[str] = None        # 详细信息
    documentation: Optional[str] = None # 文档说明
    insert_text: Optional[str] = None   # 自定义插入文本（如果与 text 不同）
    sort_text: Optional[str] = None     # 排序文本

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "display_text": self.display_text,
            "kind": self.kind,
            "detail": self.detail,
            "documentation": self.documentation,
            "insert_text": self.insert_text or self.text,
        }


class CompletionBackend(ABC):
    """补全后端抽象基类"""

    @abstractmethod
    async def complete(self, file_path: str, content: str,
                       line: int, column: int) -> List[CompletionItem]:
        """获取补全建议"""
        pass

    @abstractmethod
    def can_handle(self, file_extension: str) -> bool:
        """是否可以处理该文件类型"""
        pass


class JediBackend(CompletionBackend):
    """Jedi 补全后端 - 用于 Python"""

    def __init__(self):
        self._jedi = None

    @property
    def jedi(self):
        if self._jedi is None:
            try:
                import jedi
                self._jedi = jedi
            except ImportError:
                raise ImportError(
                    "jedi 未安装，请运行: pip install jedi"
                )
        return self._jedi

    def can_handle(self, file_extension: str) -> bool:
        return file_extension.lower() == ".py"

    async def complete(self, file_path: str, content: str,
                       line: int, column: int) -> List[CompletionItem]:
        """使用 Jedi 获取 Python 补全"""
        try:
            script = self.jedi.Script(code=content, path=file_path)
            # Jedi 使用 1-based 行号
            completions = script.complete(line + 1, column)

            items = []
            for c in completions[:100]:  # 限制数量
                items.append(CompletionItem(
                    text=c.name,
                    display_text=c.name,
                    kind=self._jedi_type_to_kind(c.type),
                    detail=c.description or None,
                    documentation=c.docstring() if c.docstring() else None,
                    sort_text=c.name,
                ))

            return items

        except Exception as e:
            print(f"Jedi 补全错误: {e}")
            return []

    def _jedi_type_to_kind(self, jedi_type: str) -> str:
        mapping = {
            "function": "function",
            "class": "class",
            "instance": "variable",
            "module": "module",
            "keyword": "keyword",
            "param": "parameter",
            "property": "property",
            "statement": "variable",
        }
        return mapping.get(jedi_type, "variable")


class TreeSitterBackend(CompletionBackend):
    """Tree-sitter 补全后端 - 通用语法解析"""

    # 支持的语言配置
    LANGUAGE_CONFIG = {
        ".py": {"language": "python", "symbols": ["function_definition", "class_definition"]},
        ".js": {"language": "javascript", "symbols": ["function_declaration", "class_declaration"]},
        ".ts": {"language": "typescript", "symbols": ["function_declaration", "class_declaration"]},
        ".go": {"language": "go", "symbols": ["function_declaration", "method_declaration", "type_declaration"]},
        ".rs": {"language": "rust", "symbols": ["function_definition", "struct_item"]},
    }

    def __init__(self):
        self._parser = None
        self._languages = {}

    def can_handle(self, file_extension: str) -> bool:
        return file_extension.lower() in self.LANGUAGE_CONFIG

    async def complete(self, file_path: str, content: str,
                       line: int, column: int) -> List[CompletionItem]:
        """使用 Tree-sitter 解析并提取符号"""
        try:
            import tree_sitter_python as tspython

            # 简化实现：使用正则提取符号
            return await self._regex_based_complete(content, line, column)

        except ImportError:
            return await self._regex_based_complete(content, line, column)

    async def _regex_based_complete(self, content: str,
                                     line: int, column: int) -> List[CompletionItem]:
        """基于正则的简单补全"""
        symbols = set()

        # 提取符号的正则模式
        patterns = [
            # Python
            (r'def\s+(\w+)\s*\(', 'function'),
            (r'class\s+(\w+)\s*[:\(]', 'class'),
            (r'(\w+)\s*=\s*', 'variable'),
            # JavaScript/TypeScript
            (r'function\s+(\w+)\s*\(', 'function'),
            (r'const\s+(\w+)\s*=', 'variable'),
            (r'let\s+(\w+)\s*=', 'variable'),
            (r'var\s+(\w+)\s*=', 'variable'),
            # Go
            (r'func\s+(\w+)\s*\(', 'function'),
            (r'type\s+(\w+)\s+struct', 'class'),
            # Generic
            (r'import\s+.*?(\w+)', 'module'),
        ]

        for pattern, kind in patterns:
            for match in re.finditer(pattern, content):
                symbols.add((match.group(1), kind))

        # 获取当前输入的前缀
        lines = content.split('\n')
        prefix = ""
        if line < len(lines):
            current_line = lines[line]
            prefix_match = re.search(r'(\w+)$', current_line[:column])
            if prefix_match:
                prefix = prefix_match.group(1).lower()

        # 过滤并生成补全项
        items = []
        for name, kind in sorted(symbols):
            if prefix and not name.lower().startswith(prefix):
                continue
            items.append(CompletionItem(
                text=name,
                display_text=name,
                kind=kind,
                sort_text=name,
            ))

        return items[:50]


class KeywordBackend(CompletionBackend):
    """关键字补全后端"""

    KEYWORDS = {
        ".py": [
            "def", "class", "import", "from", "return", "if", "else", "elif",
            "for", "while", "try", "except", "finally", "with", "as", "pass",
            "break", "continue", "yield", "lambda", "True", "False", "None",
            "and", "or", "not", "in", "is", "assert", "raise", "global", "nonlocal",
            "async", "await",
        ],
        ".js": [
            "function", "class", "const", "let", "var", "return", "if", "else",
            "for", "while", "do", "switch", "case", "break", "continue", "try",
            "catch", "finally", "throw", "new", "this", "super", "extends",
            "import", "export", "from", "async", "await", "yield", "true", "false",
            "null", "undefined", "typeof", "instanceof", "in", "of",
        ],
        ".ts": [
            "function", "class", "const", "let", "var", "return", "if", "else",
            "for", "while", "do", "switch", "case", "break", "continue", "try",
            "catch", "finally", "throw", "new", "this", "super", "extends",
            "import", "export", "from", "async", "await", "yield", "type", "interface",
            "enum", "namespace", "module", "declare", "public", "private", "protected",
            "readonly", "abstract", "implements", "keyof", "infer", "never", "unknown",
        ],
        ".go": [
            "package", "import", "func", "return", "var", "const", "type", "struct",
            "interface", "map", "chan", "if", "else", "for", "range", "switch",
            "case", "default", "break", "continue", "goto", "fallthrough", "defer",
            "go", "select", "true", "false", "nil", "error",
        ],
    }

    def can_handle(self, file_extension: str) -> bool:
        return file_extension.lower() in self.KEYWORDS

    async def complete(self, file_path: str, content: str,
                       line: int, column: int) -> List[CompletionItem]:
        """提供关键字补全"""
        ext = Path(file_path).suffix.lower()
        keywords = self.KEYWORDS.get(ext, [])

        # 获取前缀
        lines = content.split('\n')
        prefix = ""
        if line < len(lines):
            current_line = lines[line]
            prefix_match = re.search(r'(\w+)$', current_line[:column])
            if prefix_match:
                prefix = prefix_match.group(1).lower()

        items = []
        for kw in keywords:
            if prefix and not kw.lower().startswith(prefix):
                continue
            items.append(CompletionItem(
                text=kw,
                display_text=kw,
                kind="keyword",
                sort_text=f"zzz_{kw}",  # 关键字排后面
            ))

        return items


class CodeCompletionEngine:
    """代码补全引擎 - 整合多个后端"""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root).resolve()
        self.backends: List[CompletionBackend] = []
        self._init_backends()

    def _init_backends(self):
        """初始化补全后端"""
        # 按优先级添加后端
        self.backends.append(JediBackend())
        self.backends.append(TreeSitterBackend())
        self.backends.append(KeywordBackend())

    async def complete(self, file_path: str, content: str,
                       line: int, column: int) -> List[CompletionItem]:
        """
        获取补全建议

        Args:
            file_path: 文件路径（用于确定语言类型）
            content: 文件内容
            line: 当前行号（0-based）
            column: 当前列号（0-based）

        Returns:
            补全项列表
        """
        ext = Path(file_path).suffix.lower()
        all_items = []
        seen_texts = set()

        for backend in self.backends:
            if not backend.can_handle(ext):
                continue

            try:
                items = await backend.complete(file_path, content, line, column)

                # 去重
                for item in items:
                    if item.text not in seen_texts:
                        seen_texts.add(item.text)
                        all_items.append(item)

            except Exception as e:
                # 后端失败不影响其他后端
                print(f"补全后端 {backend.__class__.__name__} 错误: {e}")
                continue

        # 排序：类型优先级，然后字母序
        kind_priority = {
            "function": 1,
            "class": 2,
            "variable": 3,
            "parameter": 4,
            "module": 5,
            "keyword": 6,
            "property": 7,
        }

        all_items.sort(key=lambda x: (
            kind_priority.get(x.kind, 99),
            x.sort_text or x.text
        ))

        return all_items[:100]  # 限制返回数量

    async def complete_with_context(self, file_path: str, content: str,
                                    line: int, column: int,
                                    additional_context: Optional[str] = None) -> List[CompletionItem]:
        """
        带额外上下文的补全（可扩展用于 AI 辅助补全）
        """
        # 基础补全
        items = await self.complete(file_path, content, line, column)

        # TODO: 这里可以添加 AI 辅助补全逻辑
        # 例如：将代码上下文发送给 LLM 获取智能补全建议

        return items


class DiagnosticsEngine:
    """代码诊断引擎"""

    async def diagnose(self, file_path: str, content: str) -> list[dict]:
        """
        获取代码诊断信息

        Returns:
            诊断信息列表，每项包含: line, column, severity, message
        """
        ext = Path(file_path).suffix.lower()

        if ext == ".py":
            return await self._diagnose_python(file_path, content)
        else:
            return []

    async def _diagnose_python(self, file_path: str, content: str) -> list[dict]:
        """Python 语法检查"""
        diagnostics = []

        try:
            import py_compile
            import tempfile

            # 编译检查语法
            with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as f:
                f.write(content.encode('utf-8'))
                temp_path = f.name

            try:
                py_compile.compile(temp_path, doraise=True)
            except py_compile.PyCompileError as e:
                # 解析错误信息
                diagnostics.append({
                    "line": e.lineno - 1 if e.lineno else 0,
                    "column": e.offset - 1 if e.offset else 0,
                    "severity": "error",
                    "message": str(e.msg) if hasattr(e, 'msg') else str(e),
                })
            finally:
                os.unlink(temp_path)

        except ImportError:
            pass

        return diagnostics
