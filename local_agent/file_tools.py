"""
文件系统操作工具
"""

import os
import aiofiles
import aiofiles.os
from pathlib import Path
from typing import Optional, Union
import shutil


class FileTools:
    """文件系统操作工具"""

    def __init__(self, workspace_root: str):
        """
        初始化文件工具

        Args:
            workspace_root: 工作区根目录，所有操作将被限制在此目录内
        """
        self.workspace_root = Path(workspace_root).resolve()

    def _resolve_path(self, path: str) -> Path:
        """
        安全解析路径，防止路径穿越攻击

        Args:
            path: 相对路径

        Returns:
            解析后的绝对路径

        Raises:
            PermissionError: 如果路径越界
        """
        # 处理空路径
        if not path:
            return self.workspace_root

        full_path = (self.workspace_root / path).resolve()

        # 安全检查：确保路径在工作区内
        try:
            full_path.relative_to(self.workspace_root)
        except ValueError:
            raise PermissionError(f"路径越界，不允许访问工作区外部: {path}")

        return full_path

    async def read_file(self, path: str, encoding: str = "utf-8") -> str:
        """
        读取文件内容

        Args:
            path: 相对路径
            encoding: 文件编码

        Returns:
            文件内容
        """
        file_path = self._resolve_path(path)

        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {path}")

        if not file_path.is_file():
            raise IsADirectoryError(f"路径不是文件: {path}")

        async with aiofiles.open(file_path, mode='r', encoding=encoding) as f:
            return await f.read()

    async def read_file_bytes(self, path: str) -> bytes:
        """读取文件内容（二进制模式）"""
        file_path = self._resolve_path(path)

        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {path}")

        async with aiofiles.open(file_path, mode='rb') as f:
            return await f.read()

    async def write_file(self, path: str, content: Union[str, bytes],
                         encoding: str = "utf-8") -> int:
        """
        写入文件

        Args:
            path: 相对路径
            content: 文件内容
            encoding: 文件编码（仅用于文本模式）

        Returns:
            写入的字节数
        """
        file_path = self._resolve_path(path)

        # 确保父目录存在
        file_path.parent.mkdir(parents=True, exist_ok=True)

        if isinstance(content, bytes):
            async with aiofiles.open(file_path, mode='wb') as f:
                await f.write(content)
            return len(content)
        else:
            async with aiofiles.open(file_path, mode='w', encoding=encoding) as f:
                await f.write(content)
            return len(content.encode(encoding))

    async def append_file(self, path: str, content: str, encoding: str = "utf-8") -> int:
        """追加内容到文件"""
        file_path = self._resolve_path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)

        async with aiofiles.open(file_path, mode='a', encoding=encoding) as f:
            await f.write(content)
        return len(content.encode(encoding))

    async def list_directory(self, path: str = ".",
                             recursive: bool = False,
                             include_hidden: bool = False) -> list[dict]:
        """
        列出目录内容

        Args:
            path: 相对路径
            recursive: 是否递归列出
            include_hidden: 是否包含隐藏文件

        Returns:
            文件/目录信息列表
        """
        dir_path = self._resolve_path(path)

        if not dir_path.exists():
            raise FileNotFoundError(f"目录不存在: {path}")

        if not dir_path.is_dir():
            raise NotADirectoryError(f"路径不是目录: {path}")

        result = []

        if recursive:
            for root, dirs, files in os.walk(dir_path):
                root_path = Path(root)
                rel_root = root_path.relative_to(self.workspace_root)

                # 过滤隐藏目录
                if not include_hidden:
                    dirs[:] = [d for d in dirs if not d.startswith('.')]

                for name in dirs:
                    if not include_hidden and name.startswith('.'):
                        continue
                    full_path = root_path / name
                    result.append({
                        "name": name,
                        "path": str(rel_root / name),
                        "type": "directory",
                    })

                for name in files:
                    if not include_hidden and name.startswith('.'):
                        continue
                    full_path = root_path / name
                    stat = full_path.stat()
                    result.append({
                        "name": name,
                        "path": str(rel_root / name),
                        "type": "file",
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                    })
        else:
            for item in dir_path.iterdir():
                if not include_hidden and item.name.startswith('.'):
                    continue

                item_info = {
                    "name": item.name,
                    "path": str(item.relative_to(self.workspace_root)),
                    "type": "directory" if item.is_dir() else "file",
                }

                if item.is_file():
                    stat = item.stat()
                    item_info["size"] = stat.st_size
                    item_info["modified"] = stat.st_mtime

                result.append(item_info)

        return sorted(result, key=lambda x: (x["type"] == "file", x["name"]))

    async def delete(self, path: str) -> bool:
        """
        删除文件或目录

        Args:
            path: 相对路径

        Returns:
            是否成功
        """
        file_path = self._resolve_path(path)

        if not file_path.exists():
            raise FileNotFoundError(f"路径不存在: {path}")

        if file_path.is_dir():
            shutil.rmtree(file_path)
        else:
            file_path.unlink()

        return True

    async def exists(self, path: str) -> dict:
        """
        检查路径是否存在

        Returns:
            包含存在性信息的字典
        """
        file_path = self._resolve_path(path)

        return {
            "exists": file_path.exists(),
            "is_file": file_path.is_file() if file_path.exists() else False,
            "is_dir": file_path.is_dir() if file_path.exists() else False,
            "path": str(file_path.relative_to(self.workspace_root)),
        }

    async def create_directory(self, path: str) -> bool:
        """创建目录"""
        dir_path = self._resolve_path(path)
        dir_path.mkdir(parents=True, exist_ok=True)
        return True

    async def move(self, src: str, dst: str) -> bool:
        """移动/重命名文件或目录"""
        src_path = self._resolve_path(src)
        dst_path = self._resolve_path(dst)

        if not src_path.exists():
            raise FileNotFoundError(f"源路径不存在: {src}")

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src_path), str(dst_path))
        return True

    async def copy(self, src: str, dst: str) -> bool:
        """复制文件或目录"""
        src_path = self._resolve_path(src)
        dst_path = self._resolve_path(dst)

        if not src_path.exists():
            raise FileNotFoundError(f"源路径不存在: {src}")

        dst_path.parent.mkdir(parents=True, exist_ok=True)

        if src_path.is_dir():
            shutil.copytree(str(src_path), str(dst_path))
        else:
            shutil.copy2(str(src_path), str(dst_path))

        return True

    async def get_info(self, path: str) -> dict:
        """获取文件/目录详细信息"""
        file_path = self._resolve_path(path)

        if not file_path.exists():
            raise FileNotFoundError(f"路径不存在: {path}")

        stat = file_path.stat()

        return {
            "name": file_path.name,
            "path": str(file_path.relative_to(self.workspace_root)),
            "type": "directory" if file_path.is_dir() else "file",
            "size": stat.st_size if file_path.is_file() else None,
            "created": stat.st_ctime,
            "modified": stat.st_mtime,
            "accessed": stat.st_atime,
            "extension": file_path.suffix if file_path.is_file() else None,
        }

    async def search(self, pattern: str, path: str = ".") -> list[dict]:
        """
        搜索文件

        Args:
            pattern: glob 模式
            path: 搜索起始目录

        Returns:
            匹配的文件列表
        """
        import fnmatch

        dir_path = self._resolve_path(path)

        if not dir_path.exists():
            raise FileNotFoundError(f"目录不存在: {path}")

        result = []

        for root, dirs, files in os.walk(dir_path):
            root_path = Path(root)
            rel_root = root_path.relative_to(self.workspace_root)

            for name in files:
                if fnmatch.fnmatch(name, pattern):
                    full_path = root_path / name
                    stat = full_path.stat()
                    result.append({
                        "name": name,
                        "path": str(rel_root / name),
                        "type": "file",
                        "size": stat.st_size,
                    })

        return result
