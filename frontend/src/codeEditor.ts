/**
 * 代码编辑器组件
 * 使用 system.run 执行 shell 命令来实现文件操作
 */

import { AgentClient } from "./client.js";
import { Logger } from "./logger.js";
import { CompletionItem } from "./types.js";

interface OpenFile {
  path: string;
  content: string;
  modified: boolean;
}

export class CodeEditor {
  private container: HTMLTextAreaElement;
  private lineNumbers: HTMLElement;
  private tabsContainer: HTMLElement;
  private cursorPosition: HTMLElement;
  private fileInfo: HTMLElement;
  private client: AgentClient;
  private logger: Logger;

  private openFiles: Map<string, OpenFile> = new Map();
  private currentFile: string | null = null;
  private completions: CompletionItem[] = [];
  private completionBox: HTMLDivElement | null = null;
  private nodeId: string | null = null;

  constructor(
    container: HTMLTextAreaElement,
    lineNumbers: HTMLElement,
    tabsContainer: HTMLElement,
    cursorPosition: HTMLElement,
    fileInfo: HTMLElement,
    client: AgentClient
  ) {
    this.container = container;
    this.lineNumbers = lineNumbers;
    this.tabsContainer = tabsContainer;
    this.cursorPosition = cursorPosition;
    this.fileInfo = fileInfo;
    this.client = client;
    this.logger = Logger.getInstance();

    this.findNode();
    this.init();
  }

  private async findNode(): Promise<void> {
    const nodes = this.client.getNodes();
    if (nodes.length > 0) {
      this.nodeId = nodes[0].nodeId;
    }
  }

  private init(): void {
    // 更新行号
    this.container.addEventListener("input", () => {
      this.updateLineNumbers();
      this.markModified();
    });

    this.container.addEventListener("scroll", () => {
      this.lineNumbers.scrollTop = this.container.scrollTop;
    });

    // 更新光标位置
    this.container.addEventListener("keyup", () => {
      this.updateCursorPosition();
    });

    this.container.addEventListener("click", () => {
      this.updateCursorPosition();
    });

    // Tab 键支持
    this.container.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = this.container.selectionStart;
        const end = this.container.selectionEnd;
        const value = this.container.value;
        this.container.value = value.substring(0, start) + "  " + value.substring(end);
        this.container.selectionStart = this.container.selectionEnd = start + 2;
        this.updateLineNumbers();
        this.markModified();
      }

      // Ctrl+S 保存
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        this.save();
      }
    });

    // 创建补全框
    this.createCompletionBox();
  }

  /**
   * 执行 shell 命令
   */
  private async runCommand(shellCommand: string): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      if (!this.nodeId) {
        return { success: false, error: "没有可用的节点" };
      }

      // system.run 需要 command 参数为 ["bash", "-lc", "command"] 格式
      const result = await this.client.invokeNodeCommand(this.nodeId, "system.run", {
        command: ["bash", "-lc", shellCommand],
        timeoutMs: 30000,
      });

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

        // 失败的情况 - 有 stderr 也可以算部分成功
        if (outer.ok === true && payload?.exitCode === 0) {
          return {
            success: true,
            output: payload.stdout ?? "",
          };
        }

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

  async openFile(path: string): Promise<void> {
    try {
      // 检查是否已打开
      if (this.openFiles.has(path)) {
        this.switchToFile(path);
        return;
      }

      if (!this.nodeId) {
        await this.findNode();
      }

      if (!this.nodeId) {
        this.logger.error("没有可用的节点");
        return;
      }

      this.logger.info(`打开文件: ${path}`);

      // 使用 cat 命令读取文件
      const result = await this.runCommand(`cat "${path}"`);

      if (!result.success) {
        this.logger.error(`打开失败: ${result.error}`);
        return;
      }

      // 添加到打开文件列表
      this.openFiles.set(path, {
        path,
        content: result.output || "",
        modified: false,
      });

      // 渲染标签
      this.renderTabs();

      // 切换到该文件
      this.switchToFile(path);

      this.logger.success(`已打开: ${path}`);
    } catch (error) {
      this.logger.error("打开文件失败", error);
    }
  }

  async save(): Promise<void> {
    if (!this.currentFile) {
      this.logger.warning("没有打开的文件");
      return;
    }

    if (!this.nodeId) {
      this.logger.error("没有可用的节点");
      return;
    }

    const file = this.openFiles.get(this.currentFile);
    if (!file) return;

    try {
      this.logger.info(`保存文件: ${this.currentFile}`);

      const content = this.container.value;

      // 使用 base64 编码来安全传输文件内容
      // Node.js 环境: 使用 Buffer, 浏览器环境: 使用 btoa
      const base64Content = btoa(unescape(encodeURIComponent(content)));
      const saveCmd = `echo "${base64Content}" | base64 -d > "${this.currentFile}"`;

      const result = await this.runCommand(saveCmd);

      if (!result.success) {
        this.logger.error(`保存失败: ${result.error}`);
        return;
      }

      file.content = content;
      file.modified = false;

      this.renderTabs();
      this.updateFileInfo();

      this.logger.success("文件已保存");
    } catch (error) {
      this.logger.error("保存失败", error);
    }
  }

  /**
   * 创建新文件
   */
  async createFile(path: string): Promise<boolean> {
    if (!this.nodeId) {
      this.logger.error("没有可用的节点");
      return false;
    }

    try {
      // 检查文件是否已存在
      const checkResult = await this.runCommand(`test -f "${path}" && echo "exists"`);
      if (checkResult.success && checkResult.output?.includes("exists")) {
        this.logger.error(`文件已存在: ${path}`);
        return false;
      }

      // 创建空文件
      const result = await this.runCommand(`touch "${path}"`);
      if (!result.success) {
        this.logger.error(`创建失败: ${result.error}`);
        return false;
      }

      // 打开新创建的文件
      await this.openFile(path);
      return true;
    } catch (error) {
      this.logger.error("创建文件失败", error);
      return false;
    }
  }

  closeFile(path: string): void {
    this.openFiles.delete(path);
    this.renderTabs();

    if (this.currentFile === path) {
      // 切换到其他文件或清空
      const files = Array.from(this.openFiles.keys());
      if (files.length > 0) {
        this.switchToFile(files[files.length - 1]);
      } else {
        this.currentFile = null;
        this.container.value = "";
        this.updateLineNumbers();
        this.fileInfo.textContent = "";
      }
    }
  }

  getCurrentFile(): string | null {
    return this.currentFile;
  }

  getCurrentContent(): string | null {
    if (!this.currentFile) return null;
    return this.container.value;
  }

  setContent(content: string): void {
    this.container.value = content;
    this.updateLineNumbers();
    this.markModified();
  }

  /**
   * 刷新当前文件内容（从磁盘重新读取）
   */
  async refreshCurrentFile(): Promise<string | null> {
    if (!this.currentFile) return null;

    const result = await this.runCommand(`cat "${this.currentFile}"`);
    if (!result.success) {
      this.logger.error(`刷新失败: ${result.error}`);
      return null;
    }

    const newContent = result.output || "";
    const oldContent = this.container.value;

    // 更新文件内容
    const file = this.openFiles.get(this.currentFile);
    if (file) {
      file.content = newContent;
      file.modified = false;
    }

    // 更新编辑器显示
    this.container.value = newContent;
    this.updateLineNumbers();
    this.updateFileInfo();
    this.renderTabs();

    // 返回旧内容用于diff比较
    return oldContent !== newContent ? oldContent : null;
  }

  /**
   * 检查文件是否已打开
   */
  isOpen(path: string): boolean {
    return this.openFiles.has(path);
  }

  /**
   * 刷新指定文件（如果已打开）
   */
  async refreshFile(path: string): Promise<{ oldContent: string; newContent: string } | null> {
    if (!this.openFiles.has(path)) return null;

    const result = await this.runCommand(`cat "${path}"`);
    if (!result.success) return null;

    const file = this.openFiles.get(path)!;
    const oldContent = file.content;
    const newContent = result.output || "";

    file.content = newContent;
    file.modified = false;

    // 如果是当前文件，更新显示
    if (this.currentFile === path) {
      this.container.value = newContent;
      this.updateLineNumbers();
      this.updateFileInfo();
    }

    this.renderTabs();

    return { oldContent, newContent };
  }

  private switchToFile(path: string): void {
    const file = this.openFiles.get(path);
    if (!file) return;

    this.currentFile = path;
    this.container.value = file.content;

    this.updateLineNumbers();
    this.updateFileInfo();
    this.renderTabs();
  }

  private renderTabs(): void {
    const html = Array.from(this.openFiles.entries())
      .map(([path, file]) => {
        const name = path.split("/").pop() || path;
        const modified = file.modified ? " ●" : "";
        const active = path === this.currentFile ? "active" : "";

        return `
          <div class="editor-tab ${active}" data-path="${path}">
            <span class="tab-name">${this.escapeHtml(name)}${modified}</span>
            <button class="tab-close" data-path="${path}">&times;</button>
          </div>
        `;
      })
      .join("");

    this.tabsContainer.innerHTML = html;

    // 绑定标签点击
    this.tabsContainer.querySelectorAll(".editor-tab").forEach((el) => {
      el.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (!target.classList.contains("tab-close")) {
          const path = el.getAttribute("data-path");
          if (path) this.switchToFile(path);
        }
      });
    });

    // 绑定关闭按钮
    this.tabsContainer.querySelectorAll(".tab-close").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const path = el.getAttribute("data-path");
        if (path) this.closeFile(path);
      });
    });
  }

  private updateLineNumbers(): void {
    const lines = this.container.value.split("\n").length;
    const html = Array.from({ length: lines }, (_, i) => `<div class="line-number">${i + 1}</div>`).join("");
    this.lineNumbers.innerHTML = html;
  }

  private updateCursorPosition(): void {
    const pos = this.container.selectionStart;
    const lines = this.container.value.substring(0, pos).split("\n");
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;

    this.cursorPosition.textContent = `行 ${line}, 列 ${col}`;
  }

  private updateFileInfo(): void {
    if (this.currentFile) {
      const ext = this.currentFile.split(".").pop() || "";
      const lines = this.container.value.split("\n").length;
      this.fileInfo.textContent = `${ext.toUpperCase()} | ${lines} 行`;
    }
  }

  private markModified(): void {
    if (!this.currentFile) return;

    const file = this.openFiles.get(this.currentFile);
    if (file && !file.modified) {
      const originalContent = file.content;
      file.modified = this.container.value !== originalContent;
      this.renderTabs();
    }
  }

  private createCompletionBox(): void {
    this.completionBox = document.createElement("div");
    this.completionBox.className = "completion-box hidden";
    this.completionBox.style.cssText = `
      position: absolute;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 100;
      min-width: 200px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(this.completionBox);
  }

  private hideCompletions(): void {
    if (this.completionBox) {
      this.completionBox.classList.add("hidden");
    }
  }

  private getKindIcon(kind: string): string {
    const icons: Record<string, string> = {
      function: "ƒ",
      class: "C",
      variable: "v",
      keyword: "K",
      module: "M",
      property: "P",
      parameter: "p",
    };
    return icons[kind] || "?";
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
