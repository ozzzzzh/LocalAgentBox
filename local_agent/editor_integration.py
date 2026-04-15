"""
编辑器集成
支持 VSCode、Cursor 等编辑器
"""

import asyncio
import subprocess
import platform
import os
from abc import ABC, abstractmethod
from typing import Optional, Tuple
from pathlib import Path


class EditorIntegration(ABC):
    """编辑器集成抽象基类"""

    @abstractmethod
    async def open_file(self, file_path: str, line: int = 0, column: int = 0) -> bool:
        """
        打开文件并跳转到指定位置

        Args:
            file_path: 文件绝对路径
            line: 行号（0-based）
            column: 列号（0-based）

        Returns:
            是否成功
        """
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        """检查编辑器是否可用"""
        pass

    async def get_current_file(self) -> Optional[str]:
        """获取当前打开的文件路径（需要扩展支持）"""
        return None

    async def get_selection(self) -> Optional[Tuple[str, Tuple[int, int, int, int]]]:
        """获取当前选中的文本和范围（需要扩展支持）"""
        return None


class VSCodeIntegration(EditorIntegration):
    """VSCode 编辑器集成"""

    def __init__(self):
        self.code_cmd = self._find_code_cmd()

    def _find_code_cmd(self) -> Optional[str]:
        """查找 code 命令路径"""
        system = platform.system()

        if system == "Windows":
            # Windows 下可能的路径
            possible_paths = [
                "code",
                os.path.expandvars(r"%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code"),
                os.path.expandvars(r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"),
            ]
            for path in possible_paths:
                if os.path.exists(path) or self._command_exists(path):
                    return path

        elif system == "Darwin":  # macOS
            possible_paths = [
                "code",
                "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
            ]
            for path in possible_paths:
                if os.path.exists(path) or self._command_exists(path):
                    return path

        else:  # Linux
            possible_paths = [
                "code",
                "/usr/bin/code",
                "/usr/local/bin/code",
                os.path.expanduser("~/.local/bin/code"),
            ]
            for path in possible_paths:
                if os.path.exists(path) or self._command_exists(path):
                    return path

        return "code"  # 默认尝试 PATH 中的 code

    def _command_exists(self, cmd: str) -> bool:
        """检查命令是否存在"""
        try:
            result = subprocess.run(
                ["which", cmd] if platform.system() != "Windows" else ["where", cmd],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    async def is_available(self) -> bool:
        """检查 VSCode 是否可用"""
        if not self.code_cmd:
            return False

        try:
            proc = await asyncio.create_subprocess_exec(
                self.code_cmd, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await asyncio.wait_for(proc.wait(), timeout=5)
            return proc.returncode == 0
        except Exception:
            return False

    async def open_file(self, file_path: str, line: int = 0, column: int = 0) -> bool:
        """使用 VSCode 打开文件"""
        if not self.code_cmd:
            return False

        try:
            # VSCode 使用 1-based 行号和列号
            goto_arg = f"{file_path}:{line + 1}:{column + 1}"

            proc = await asyncio.create_subprocess_exec(
                self.code_cmd, "-g", goto_arg,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            # 不等待完成，因为 VSCode 会后台启动
            return True

        except Exception as e:
            print(f"VSCode 打开文件失败: {e}")
            return False

    async def open_folder(self, folder_path: str) -> bool:
        """在 VSCode 中打开文件夹"""
        if not self.code_cmd:
            return False

        try:
            proc = await asyncio.create_subprocess_exec(
                self.code_cmd, folder_path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            return True
        except Exception:
            return False

    async def diff_files(self, file1: str, file2: str) -> bool:
        """打开文件对比"""
        if not self.code_cmd:
            return False

        try:
            proc = await asyncio.create_subprocess_exec(
                self.code_cmd, "-d", file1, file2,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            return True
        except Exception:
            return False


class CursorIntegration(EditorIntegration):
    """Cursor 编辑器集成"""

    def __init__(self):
        self.cursor_cmd = self._find_cursor_cmd()

    def _find_cursor_cmd(self) -> Optional[str]:
        """查找 cursor 命令路径"""
        system = platform.system()

        if system == "Windows":
            possible_paths = [
                "cursor",
                os.path.expandvars(r"%LOCALAPPDATA%\Programs\cursor\resources\app\bin\cursor"),
                os.path.expandvars(r"%LOCALAPPDATA%\Programs\cursor\Cursor.exe"),
                os.path.expandvars(r"%APPDATA%\Local\Programs\cursor\Cursor.exe"),
            ]
            for path in possible_paths:
                if os.path.exists(path) or self._command_exists(path):
                    return path

        elif system == "Darwin":  # macOS
            possible_paths = [
                "cursor",
                "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
            ]
            for path in possible_paths:
                if os.path.exists(path) or self._command_exists(path):
                    return path

        else:  # Linux
            possible_paths = [
                "cursor",
                "/usr/bin/cursor",
                os.path.expanduser("~/.local/bin/cursor"),
                os.path.expanduser("~/Applications/Cursor.AppImage"),
            ]
            for path in possible_paths:
                if os.path.exists(path) or self._command_exists(path):
                    return path

        return "cursor"

    def _command_exists(self, cmd: str) -> bool:
        """检查命令是否存在"""
        try:
            result = subprocess.run(
                ["which", cmd] if platform.system() != "Windows" else ["where", cmd],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    async def is_available(self) -> bool:
        """检查 Cursor 是否可用"""
        if not self.cursor_cmd:
            return False

        try:
            proc = await asyncio.create_subprocess_exec(
                self.cursor_cmd, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await asyncio.wait_for(proc.wait(), timeout=5)
            return proc.returncode == 0
        except Exception:
            return False

    async def open_file(self, file_path: str, line: int = 0, column: int = 0) -> bool:
        """使用 Cursor 打开文件"""
        if not self.cursor_cmd:
            return False

        try:
            goto_arg = f"{file_path}:{line + 1}:{column + 1}"

            proc = await asyncio.create_subprocess_exec(
                self.cursor_cmd, "-g", goto_arg,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            return True

        except Exception as e:
            print(f"Cursor 打开文件失败: {e}")
            return False


class PyCharmIntegration(EditorIntegration):
    """PyCharm 编辑器集成"""

    def __init__(self):
        self.pycharm_cmd = self._find_pycharm_cmd()

    def _find_pycharm_cmd(self) -> Optional[str]:
        """查找 PyCharm 命令路径"""
        system = platform.system()

        if system == "Windows":
            possible_paths = [
                "pycharm64",
                os.path.expandvars(r"%ProgramFiles%\JetBrains\PyCharm*\bin\pycharm64.exe"),
                os.path.expandvars(r"%ProgramFiles(x86)%\JetBrains\PyCharm*\bin\pycharm64.exe"),
            ]

        elif system == "Darwin":  # macOS
            possible_paths = [
                "/Applications/PyCharm.app/Contents/MacOS/pycharm",
            ]

        else:  # Linux
            possible_paths = [
                "pycharm",
                "pycharm.sh",
                os.path.expanduser("~/.local/share/JetBrains/Toolbox/apps/pycharm-*/bin/pycharm.sh"),
            ]

        for path in possible_paths:
            if "*" in path:
                # 处理通配符
                import glob
                matches = glob.glob(path)
                if matches:
                    return matches[0]
            elif os.path.exists(path) or self._command_exists(path):
                return path

        return "pycharm"

    def _command_exists(self, cmd: str) -> bool:
        try:
            result = subprocess.run(
                ["which", cmd] if platform.system() != "Windows" else ["where", cmd],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    async def is_available(self) -> bool:
        return self.pycharm_cmd is not None

    async def open_file(self, file_path: str, line: int = 0, column: int = 0) -> bool:
        if not self.pycharm_cmd:
            return False

        try:
            # PyCharm 使用 --line 参数
            args = [self.pycharm_cmd]
            if line > 0:
                args.extend(["--line", str(line + 1)])
            args.append(file_path)

            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            return True

        except Exception:
            return False


class EditorManager:
    """编辑器管理器 - 自动检测并管理多个编辑器"""

    def __init__(self):
        self.editors: dict[str, EditorIntegration] = {}
        self.primary_editor: Optional[str] = None
        self._init_editors()

    def _init_editors(self):
        """初始化编辑器集成"""
        self.editors = {
            "vscode": VSCodeIntegration(),
            "cursor": CursorIntegration(),
            "pycharm": PyCharmIntegration(),
        }

        # 尝试检测主编辑器
        self._detect_primary_editor()

    def _detect_primary_editor(self):
        """检测主编辑器"""
        # 1. 检查环境变量
        editor_env = os.environ.get("EDITOR", "").lower()
        visual_env = os.environ.get("VISUAL", "").lower()

        for env_var in [editor_env, visual_env]:
            for name in self.editors:
                if name in env_var:
                    self.primary_editor = name
                    return

        # 2. 检查哪个编辑器可用
        # 异步检测会在运行时进行
        self.primary_editor = "vscode"  # 默认

    async def detect_available_editors(self) -> list[str]:
        """检测可用的编辑器"""
        available = []

        for name, editor in self.editors.items():
            if await editor.is_available():
                available.append(name)

        # 如果当前主编辑器不可用，切换到第一个可用的
        if available and self.primary_editor not in available:
            self.primary_editor = available[0]

        return available

    async def open_file(self, file_path: str, line: int = 0,
                        column: int = 0, editor: Optional[str] = None) -> bool:
        """
        打开文件

        Args:
            file_path: 文件路径
            line: 行号
            column: 列号
            editor: 指定编辑器，为 None 则使用主编辑器

        Returns:
            是否成功
        """
        editor_name = editor or self.primary_editor

        if not editor_name or editor_name not in self.editors:
            return False

        return await self.editors[editor_name].open_file(file_path, line, column)

    def set_primary_editor(self, name: str) -> bool:
        """设置主编辑器"""
        if name in self.editors:
            self.primary_editor = name
            return True
        return False

    def get_editor(self, name: str) -> Optional[EditorIntegration]:
        """获取指定编辑器实例"""
        return self.editors.get(name)

    def list_editors(self) -> list[str]:
        """列出所有支持的编辑器"""
        return list(self.editors.keys())


# 便捷函数
async def open_in_editor(file_path: str, line: int = 0, column: int = 0,
                         editor: Optional[str] = None) -> bool:
    """
    便捷函数：在编辑器中打开文件

    Args:
        file_path: 文件路径
        line: 行号（0-based）
        column: 列号（0-based）
        editor: 指定编辑器

    Returns:
        是否成功
    """
    manager = EditorManager()
    return await manager.open_file(file_path, line, column, editor)
