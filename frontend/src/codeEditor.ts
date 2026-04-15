/**
 * 代码编辑器组件
 */

import { AgentClient } from "./client";
import { Logger } from "./logger";
import { CompletionItem } from "./types";

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

    this.init();
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

      // Ctrl+Space 触发补全
      if (e.ctrlKey && e.key === " ") {
        e.preventDefault();
        this.triggerCompletion();
      }
    });

    // 创建补全框
    this.createCompletionBox();
  }

  async openFile(path: string): Promise<void> {
    try {
      // 检查是否已打开
      if (this.openFiles.has(path)) {
        this.switchToFile(path);
        return;
      }

      this.logger.info(`打开文件: ${path}`);

      const result = (await this.client.callTool("file.read", {
        path,
      })) as { success: boolean; content?: string; error?: string };

      if (!result.success) {
        this.logger.error(`打开失败: ${result.error}`);
        return;
      }

      // 添加到打开文件列表
      this.openFiles.set(path, {
        path,
        content: result.content || "",
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

    const file = this.openFiles.get(this.currentFile);
    if (!file) return;

    try {
      this.logger.info(`保存文件: ${this.currentFile}`);

      const result = (await this.client.callTool("file.write", {
        path: this.currentFile,
        content: this.container.value,
      })) as { success: boolean; error?: string };

      if (!result.success) {
        this.logger.error(`保存失败: ${result.error}`);
        return;
      }

      file.content = this.container.value;
      file.modified = false;

      this.renderTabs();
      this.updateFileInfo();

      this.logger.success("文件已保存");
    } catch (error) {
      this.logger.error("保存失败", error);
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

  private async triggerCompletion(): Promise<void> {
    if (!this.currentFile) return;

    const pos = this.container.selectionStart;
    const lines = this.container.value.substring(0, pos).split("\n");
    const line = lines.length - 1;
    const col = lines[lines.length - 1].length;

    try {
      const result = (await this.client.callTool("code.complete", {
        file_path: this.currentFile,
        line,
        column: col,
        content: this.container.value,
      })) as { success: boolean; completions?: CompletionItem[]; error?: string };

      if (result.success && result.completions) {
        this.showCompletions(result.completions);
      }
    } catch (error) {
      this.logger.error("获取补全失败", error);
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

  private showCompletions(completions: CompletionItem[]): void {
    if (!this.completionBox || completions.length === 0) return;

    const html = completions
      .slice(0, 20)
      .map(
        (c, i) => `
        <div class="completion-item" data-index="${i}" data-text="${this.escapeHtml(c.insert_text || c.text)}">
          <span class="completion-kind ${c.kind}">${this.getKindIcon(c.kind)}</span>
          <span class="completion-text">${this.escapeHtml(c.display_text)}</span>
          ${c.detail ? `<span class="completion-detail">${this.escapeHtml(c.detail)}</span>` : ""}
        </div>
      `
      )
      .join("");

    this.completionBox.innerHTML = html;
    this.completionBox.classList.remove("hidden");

    // 定位
    const rect = this.container.getBoundingClientRect();
    // 简化定位，实际应该根据光标位置计算
    this.completionBox.style.left = `${rect.left + 50}px`;
    this.completionBox.style.top = `${rect.top + 100}px`;

    // 绑定点击
    this.completionBox.querySelectorAll(".completion-item").forEach((el) => {
      el.addEventListener("click", () => {
        const text = el.getAttribute("data-text");
        if (text) {
          this.insertCompletion(text);
        }
      });
    });
  }

  private insertCompletion(text: string): void {
    const start = this.container.selectionStart;
    const end = this.container.selectionEnd;
    const value = this.container.value;

    // 找到当前词的开始位置
    let wordStart = start;
    while (wordStart > 0 && /\w/.test(value[wordStart - 1])) {
      wordStart--;
    }

    this.container.value = value.substring(0, wordStart) + text + value.substring(end);
    this.container.selectionStart = this.container.selectionEnd = wordStart + text.length;

    this.hideCompletions();
    this.updateLineNumbers();
    this.markModified();
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
