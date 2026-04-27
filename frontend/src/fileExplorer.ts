/**
 * 文件浏览器组件
 * 使用 system.run 执行 shell 命令来实现文件操作
 */

import { AgentClient } from "./client.js";
import { FileItem } from "./types.js";
import { Logger } from "./logger.js";

export class FileExplorer {
  private container: HTMLElement;
  private client: AgentClient;
  private logger: Logger;
  private currentPath: string = "";
  private onFileSelect: ((path: string) => void) | null = null;
  private nodeId: string | null = null;

  constructor(container: HTMLElement, client: AgentClient) {
    this.container = container;
    this.client = client;
    this.logger = Logger.getInstance();
    this.findNode();
  }

  /**
   * 查找可用的节点
   */
  private async findNode(): Promise<void> {
    const nodes = this.client.getNodes();
    if (nodes.length > 0) {
      this.nodeId = nodes[0].nodeId;
      this.logger.info(`使用节点: ${this.nodeId}`);
    }
  }

  setOnFileSelect(handler: (path: string) => void): void {
    this.onFileSelect = handler;
  }

  async refresh(path: string = "."): Promise<void> {
    try {
      this.logger.info(`加载目录: ${path}`);

      if (!this.nodeId) {
        await this.findNode();
      }

      if (!this.nodeId) {
        this.logger.error("没有可用的节点");
        this.container.innerHTML = '<div class="empty-state">没有可用的节点</div>';
        return;
      }

      // 使用 ls 命令获取目录内容，指定绝对路径
      const workspace = "/root/.openclaw/workspace";
      const targetPath = path === "." ? workspace : path;

      // 保存当前路径
      this.currentPath = targetPath;

      const cmd = `ls -la "${targetPath}"`;
      this.logger.debug(`执行命令: ${cmd}`);

      const result = await this.runCommand(cmd);

      if (!result.success) {
        this.logger.error(`加载失败: ${result.error}`);
        this.container.innerHTML = `<div class="empty-state">加载失败: ${result.error}</div>`;
        return;
      }

      this.logger.debug(`命令输出: ${result.output?.substring(0, 200)}...`);
      const items = this.parseLsOutput(result.output || "", targetPath);
      this.render(items);
    } catch (error) {
      this.logger.error("加载文件列表失败", error);
      this.container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
  }

  /**
   * 获取父目录路径
   */
  private getParentPath(): string {
    if (!this.currentPath) return "/root/.openclaw/workspace";
    const parts = this.currentPath.split("/").filter(p => p);
    if (parts.length <= 3) return "/root/.openclaw/workspace"; // 不超过 workspace 根目录
    parts.pop();
    return "/" + parts.join("/");
  }

  /**
   * 执行 shell 命令
   */
  private async runCommand(shellCommand: string): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      // system.run 需要 command 参数为 ["bash", "-lc", "command"] 格式
      const result = await this.client.invokeNodeCommand(this.nodeId!, "system.run", {
        command: ["bash", "-lc", shellCommand],
        timeoutMs: 10000,
      });

      this.logger.debug(`system.run 结果: ${JSON.stringify(result)?.substring(0, 300)}...`);

      // system.run 返回格式是 { ok, nodeId, command, payload: { exitCode, stdout, stderr, success, timedOut, error } }
      if (result && typeof result === "object") {
        const outer = result as {
          ok?: boolean;
          payload?: {
            exitCode?: number;
            stdout?: string;
            stderr?: string;
            success?: boolean;
            timedOut?: boolean;
            error?: string | null;
          };
        };

        const payload = outer.payload;

        // 成功的情况：ok=true 且 payload.exitCode=0 或 payload.success=true
        if (outer.ok === true && payload) {
          if (payload.exitCode === 0 || payload.success === true) {
            return {
              success: true,
              output: payload.stdout ?? "",
            };
          }
        }

        // 失败的情况
        const errorMsg = payload?.error || payload?.stderr || `命令执行失败 (exitCode=${payload?.exitCode})`;
        return {
          success: false,
          error: errorMsg,
        };
      }
      return { success: true, output: String(result) };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * 解析 ls -la 输出为文件列表
   */
  private parseLsOutput(output: string, basePath: string): FileItem[] {
    const items: FileItem[] = [];
    const lines = output.split("\n").slice(1); // 跳过 "total xxx" 行

    for (const line of lines) {
      if (!line.trim()) continue;

      const match = line.match(/^([d-])([rwx-]+)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+[\d:]+\s+(.+)$/);
      if (!match) continue;

      const isDir = match[1] === "d";
      const name = match[4].trim();

      // 跳过 . 和 ..
      if (name === "." || name === "..") continue;

      const fullPath = basePath === "." ? name : `${basePath}/${name}`;

      items.push({
        name,
        path: fullPath,
        type: isDir ? "directory" : "file",
        size: isDir ? undefined : parseInt(match[3], 10),
      });
    }

    return items;
  }

  async search(pattern: string): Promise<void> {
    try {
      this.logger.info(`搜索: ${pattern}`);

      if (!this.nodeId) {
        await this.findNode();
      }

      if (!this.nodeId) {
        this.logger.error("没有可用的节点");
        return;
      }

      // 使用 find 命令搜索
      const result = await this.runCommand(`find . -name "*${pattern}*" -type f 2>/dev/null | head -50`);

      if (!result.success) {
        this.logger.error(`搜索失败: ${result.error}`);
        return;
      }

      const files = (result.output || "").split("\n").filter((f) => f.trim());
      const items: FileItem[] = files.map((f) => ({
        name: f.split("/").pop() || f,
        path: f,
        type: "file" as const,
      }));

      this.renderSearchResults(items);
    } catch (error) {
      this.logger.error("搜索失败", error);
    }
  }

  private render(items: FileItem[]): void {
    // 排序：目录在前，然后按名称排序
    const sorted = [...items].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // 添加返回上级目录的选项（如果不在根目录）
    const workspace = "/root/.openclaw/workspace";
    const parentItem = this.currentPath && this.currentPath !== workspace
      ? `<div class="file-item directory parent-dir" data-path="${this.getParentPath()}" data-type="directory">
          <span class="icon">📁</span>
          <span class="name">..</span>
          <span class="size" style="color: var(--text-secondary); font-size: 11px;">返回上级</span>
        </div>`
      : "";

    if (sorted.length === 0 && !parentItem) {
      this.container.innerHTML = '<div class="empty-state">目录为空</div>';
      return;
    }

    const html = parentItem + sorted
      .map((item) => {
        const ext = item.name.split(".").pop() || "";
        const icon = this.getFileIcon(item.type, ext);
        const size = item.size ? this.formatSize(item.size) : "";

        return `
          <div class="file-item ${item.type}" data-path="${item.path}" data-type="${item.type}">
            <span class="icon">${icon}</span>
            <span class="name">${this.escapeHtml(item.name)}</span>
            ${size ? `<span class="size">${size}</span>` : ""}
          </div>
        `;
      })
      .join("");

    this.container.innerHTML = html;

    // 绑定点击事件
    this.container.querySelectorAll(".file-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        const target = e.currentTarget as HTMLElement;
        const path = target.dataset.path || "";
        const type = target.dataset.type;

        // 移除其他选中
        this.container.querySelectorAll(".file-item").forEach((el) => {
          el.classList.remove("selected");
        });

        // 选中当前
        target.classList.add("selected");

        if (type === "directory") {
          this.refresh(path);
        } else if (this.onFileSelect) {
          this.onFileSelect(path);
        }
      });

      // 双击打开
      el.addEventListener("dblclick", (e) => {
        const target = e.currentTarget as HTMLElement;
        const path = target.dataset.path || "";
        const type = target.dataset.type;

        if (type === "file" && this.onFileSelect) {
          this.onFileSelect(path);
        }
      });
    });
  }

  private renderSearchResults(items: FileItem[]): void {
    if (items.length === 0) {
      this.container.innerHTML = '<div class="empty-state">未找到匹配文件</div>';
      return;
    }

    const html = items
      .map((item) => {
        const icon = this.getFileIcon(item.type, item.name.split(".").pop() || "");

        return `
          <div class="file-item ${item.type}" data-path="${item.path}" data-type="${item.type}">
            <span class="icon">${icon}</span>
            <span class="name">${this.escapeHtml(item.name)}</span>
          </div>
        `;
      })
      .join("");

    this.container.innerHTML = html;
  }

  private getFileIcon(type: string, ext: string): string {
    if (type === "directory") {
      return "📁";
    }

    const icons: Record<string, string> = {
      py: "🐍",
      js: "📜",
      ts: "📘",
      json: "📋",
      md: "📝",
      txt: "📄",
      html: "🌐",
      css: "🎨",
      go: "🐹",
      rs: "🦀",
      java: "☕",
      cpp: "⚡",
      c: "⚡",
    };

    return icons[ext.toLowerCase()] || "📄";
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
