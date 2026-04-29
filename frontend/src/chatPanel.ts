/**
 * Chat Panel 组件 - AI 对话界面
 */

import { AgentClient } from "./client.js";
import { Logger } from "./logger.js";
import { CodeEditor } from "./codeEditor.js";
import { DiffPanel } from "./diffPanel.js";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallInfo[];
  thinking?: string;
}

interface ToolCallInfo {
  id: string;
  name: string;
  arguments: unknown;
  result?: unknown;
  status: "running" | "success" | "error";
}

export class ChatPanel {
  private container: HTMLElement;
  private messagesContainer: HTMLElement;
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private client: AgentClient;
  private editor: CodeEditor | null = null;
  private logger: Logger;
  private messages: ChatMessage[] = [];
  private currentFile: string | null = null;
  private sessionId: string | null = null;
  private sessionKey: string | null = null;
  private isStreaming: boolean = false;
  private diffPanel: DiffPanel;

  constructor(
    container: HTMLElement,
    messagesContainer: HTMLElement,
    input: HTMLTextAreaElement,
    sendBtn: HTMLButtonElement,
    client: AgentClient
  ) {
    this.container = container;
    this.messagesContainer = messagesContainer;
    this.input = input;
    this.sendBtn = sendBtn;
    this.client = client;
    this.logger = Logger.getInstance();
    this.diffPanel = new DiffPanel();
    this.init();
  }

  setEditor(editor: CodeEditor): void {
    this.editor = editor;
  }

  private init(): void {
    // 发送按钮
    this.sendBtn.addEventListener("click", () => this.sendMessage());

    // 回车发送（Shift+Enter 换行）
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // 监听 Gateway 事件
    this.client.onEvent((event, payload) => {
      this.handleEvent(event, payload);
    });
  }

  /**
   * 订阅 session 的消息更新
   */
  private async subscribeToSession(key: string): Promise<void> {
    try {
      await this.client.request("sessions.messages.subscribe", { key });
      this.logger.info(`已订阅会话: ${key}`);
    } catch (error) {
      this.logger.warning("订阅会话失败", error);
    }
  }

  private async sendMessage(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.isStreaming) return;

    // 清空输入框
    this.input.value = "";

    // 构建消息内容（包含文件引用）
    let content = text;
    const fileContext = this.getFileContext();
    if (fileContext) {
      content = `${text}\n\n[当前文件: ${this.currentFile}]\n\`\`\`\n${fileContext}\n\`\`\``;
    }

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: this.generateId(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    this.messages.push(userMsg);
    this.renderMessage(userMsg);

    // 显示正在输入指示器
    this.showTypingIndicator();

    try {
      this.isStreaming = true;

      // 使用 sessions.send 发送消息
      // 确保 sessionKey 不是 heartbeat session
      if (!this.sessionKey || this.sessionKey.endsWith(":node")) {
        // 创建一个新的 session（不使用已存在的，避免选中 heartbeat session）
        const createResult = await this.client.request("sessions.create", {
          agentId: "main",
          message: content,
        }) as { key?: string };

        if (createResult.key) {
          this.sessionKey = createResult.key;
          this.updateSessionInfo();
          // 订阅消息
          await this.subscribeToSession(this.sessionKey);
          console.log(`[ChatPanel] Created new session: ${this.sessionKey}`);
        }
      } else {
        // 使用已有的 session（但要确保不是 heartbeat）
        const result = await this.client.request("sessions.send", {
          key: this.sessionKey,
          message: content,
          idempotencyKey: this.generateId(),
        });

        // 处理响应
        if (result && typeof result === "object") {
          const response = result as {
            key?: string;
            runId?: string;
            status?: string;
          };

          // 更新 sessionKey
          if (response.key) {
            this.sessionKey = response.key;
            this.updateSessionInfo();
          }
        }
      }

      this.hideTypingIndicator();
    } catch (error) {
      this.hideTypingIndicator();
      this.logger.error("发送消息失败", error);

      // 显示错误消息
      const errorMsg: ChatMessage = {
        id: this.generateId(),
        role: "assistant",
        content: `❌ 发送失败: ${error}`,
        timestamp: new Date(),
      };
      this.messages.push(errorMsg);
      this.renderMessage(errorMsg);
    } finally {
      this.isStreaming = false;
    }
  }

  private handleEvent(event: string, payload: unknown): void {
    console.log(`[ChatPanel] Event: ${event}`, JSON.stringify(payload, null, 2));
    this.logger.debug(`收到事件: ${event}`, payload);

    // 过滤掉不需要处理的事件
    if (this.shouldIgnoreEvent(event, payload)) {
      console.log(`[ChatPanel] Ignored event: ${event}`);
      return;
    }

    // 主要使用 agent 事件处理流式回复
    if (event === "agent") {
      const data = payload as {
        stream?: string;
        data?: { text?: string; delta?: string; phase?: string; name?: string; toolName?: string; args?: unknown };
        sessionKey?: string;
      };

      // lifecycle start - 显示思考状态
      if (data.stream === "lifecycle" && data.data?.phase === "start") {
        this.showThinkingIndicator("thinking");
      }

      // stream: "assistant" 包含 AI 回复的增量
      if (data.stream === "assistant" && data.data) {
        this.hideThinkingIndicator();
        const delta = data.data.delta || "";
        if (delta) {
          this.handleStreamDelta(delta, false);
        }
      }

      // stream: "tool" 包含工具调用信息
      if (data.stream === "tool" && data.data) {
        this.showThinkingIndicator("tool");
        this.handleToolEvent(data.data);
      }

      // stream: "lifecycle" phase: "end" 表示回复完成
      if (data.stream === "lifecycle" && data.data?.phase === "end") {
        this.hideThinkingIndicator();
        this.handleStreamDelta("", true);
        // 回复结束后检查文件修改并刷新当前文件
        setTimeout(() => {
          this.checkFileModifications();
          this.refreshCurrentFile();
        }, 500);
      }
    }

    // session.tool 事件也处理
    if (event === "session.tool") {
      this.handleToolEvent(payload);
    }

    // 处理 session.message 中的 toolCall
    if (event === "session.message") {
      this.handleSessionMessage(payload);
    }
  }

  /**
   * 处理 session.message 事件
   */
  private handleSessionMessage(payload: unknown): void {
    const msgData = payload as {
      sessionKey?: string;
      message?: {
        role?: string;
        content?: Array<{
          type?: string;
          text?: string;
          thinking?: string;
          name?: string;
          id?: string;
          arguments?: unknown;
        }>;
        stopReason?: string;
      };
    };

    // 忽略 heartbeat session 的消息
    if (msgData.sessionKey?.endsWith(":node")) {
      return;
    }

    if (!msgData.message || msgData.message.role !== "assistant") return;

    const content = msgData.message.content;
    if (!content || !Array.isArray(content)) return;

    // 处理每个内容项
    for (const item of content) {
      // 处理文本内容
      if (item.type === "text" && item.text && item.text.trim()) {
        // 如果是 NO_REPLY，跳过
        if (item.text.trim() === "NO_REPLY") continue;
        // 直接渲染完整消息（不使用流式）
        if (!this.streamingMessageId) {
          const msg: ChatMessage = {
            id: this.generateId(),
            role: "assistant",
            content: item.text,
            timestamp: new Date(),
          };
          this.messages.push(msg);
          this.renderMessage(msg);
        }
      }

      // 处理工具调用
      if (item.type === "toolCall" && item.name) {
        console.log(`[ChatPanel] Tool call from session.message: ${item.name}`, item.arguments);
        this.handleToolEvent({
          name: item.name,
          toolCallId: item.id,
          args: item.arguments,
        });
      }
    }

    // 如果 stopReason 是 stop，表示回复完成，刷新文件
    if (msgData.message.stopReason === "stop") {
      // 延迟刷新，确保工具执行完成
      setTimeout(() => {
        this.checkFileModifications();
        this.refreshCurrentFile();
      }, 1000);
    }
  }

  /**
   * 判断是否应该忽略该事件
   */
  private shouldIgnoreEvent(event: string, payload: unknown): boolean {
    // 只过滤心跳事件本身
    if (event === "heartbeat") {
      return true;
    }

    // 过滤 sessionKey 是 heartbeat session 的消息
    const data = payload as { sessionKey?: string };
    if (data.sessionKey && data.sessionKey.endsWith(":node")) {
      return true;
    }

    return false;
  }

  private thinkingIndicator: HTMLElement | null = null;

  private showThinkingIndicator(stream: string): void {
    if (this.thinkingIndicator) return;

    // 移除欢迎消息
    const welcome = this.messagesContainer.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    const indicator = document.createElement("div");
    indicator.className = "message assistant thinking-message";
    indicator.id = "thinkingIndicator";

    let statusText = "正在思考中...";
    if (stream === "tool") {
      statusText = "正在执行工具...";
    }

    indicator.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="thinking-status">
          <span class="thinking-spinner"></span>
          <span class="thinking-text">${statusText}</span>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(indicator);
    this.thinkingIndicator = indicator;
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private hideThinkingIndicator(): void {
    if (this.thinkingIndicator) {
      this.thinkingIndicator.remove();
      this.thinkingIndicator = null;
    }
  }

  /**
   * 刷新当前打开的文件
   */
  private async refreshCurrentFile(): Promise<void> {
    if (!this.editor) return;

    const currentFile = this.editor.getCurrentFile();
    if (!currentFile) return;

    this.logger.info(`自动刷新当前文件: ${currentFile}`);
    await this.editor.refreshCurrentFile();
  }

  /**
   * 处理工具调用事件
   */
  private handleToolEvent(data: unknown): void {
    console.log(`[ChatPanel] Tool event raw data:`, data);

    // 工具事件结构: { phase, name, toolCallId, args }
    const toolData = data as {
      phase?: string;
      name?: string;
      toolName?: string;
      toolCallId?: string;
      args?: unknown;
      arguments?: unknown;
      params?: unknown;
    };

    // name 或 toolName
    let toolName = toolData.name || toolData.toolName;
    let args = toolData.args || toolData.arguments || toolData.params;

    // 如果 args 是字符串，尝试解析
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        // ignore
      }
    }

    console.log(`[ChatPanel] Parsed tool: ${toolName}, phase: ${toolData.phase}, args:`, args);

    // 只在工具开始或更新时检测文件写入
    if (toolData.phase === "start" || toolData.phase === "update" || !toolData.phase) {
      // 检测文件写入工具
      if (toolName && this.isFileWriteTool(toolName)) {
        const fileArgs = args as Record<string, unknown>;
        const filePath = (fileArgs?.path || fileArgs?.filePath || fileArgs?.file_path) as string | undefined;

        console.log(`[ChatPanel] File write detected: ${filePath}`);

        if (filePath) {
          this.logger.info(`检测到文件写入: ${filePath}`);
          this.pendingFileModifications.add(filePath);
        }
      }
    }
  }

  /**
   * 判断是否是文件写入工具
   */
  private isFileWriteTool(toolName: string): boolean {
    const lowerName = toolName.toLowerCase();
    // 检查关键词
    const keywords = ["write", "edit", "create", "save", "modify", "update"];
    // 检查文件相关
    const fileKeywords = ["file", "fs"];

    const hasActionKeyword = keywords.some((k) => lowerName.includes(k));
    const hasFileKeyword = fileKeywords.some((k) => lowerName.includes(k));

    return hasActionKeyword && hasFileKeyword;
  }

  private pendingFileModifications: Set<string> = new Set();

  /**
   * 检查并处理文件修改
   */
  private async checkFileModifications(): Promise<void> {
    console.log(`[ChatPanel] checkFileModifications: pending files =`, [...this.pendingFileModifications]);

    if (!this.editor || this.pendingFileModifications.size === 0) {
      console.log(`[ChatPanel] checkFileModifications: no pending files or no editor`);
      return;
    }

    const filesToCheck = [...this.pendingFileModifications];
    this.pendingFileModifications.clear();

    for (const filePath of filesToCheck) {
      console.log(`[ChatPanel] Processing file: ${filePath}`);

      // 如果文件已打开，刷新并显示 diff
      if (this.editor.isOpen(filePath)) {
        console.log(`[ChatPanel] File is open, refreshing...`);
        const result = await this.editor.refreshFile(filePath);

        console.log(`[ChatPanel] Refresh result:`, result ? { oldLen: result.oldContent.length, newLen: result.newContent.length, changed: result.oldContent !== result.newContent } : null);

        if (result && result.oldContent !== result.newContent) {
          console.log(`[ChatPanel] Content changed, showing diff...`);
          // 显示 diff 面板
          this.diffPanel.show(filePath, result.oldContent, result.newContent);

          // 在聊天中添加提示消息
          const diffMsg: ChatMessage = {
            id: this.generateId(),
            role: "assistant",
            content: `📝 文件 \`${filePath.split("/").pop()}\` 已被修改`,
            timestamp: new Date(),
          };
          this.messages.push(diffMsg);
          this.renderMessage(diffMsg);
        } else {
          console.log(`[ChatPanel] No content change detected`);
        }
      } else {
        console.log(`[ChatPanel] File not open, showing info message`);
        // 文件未打开，只显示提示
        const infoMsg: ChatMessage = {
          id: this.generateId(),
          role: "assistant",
          content: `📝 文件 \`${filePath.split("/").pop()}\` 已被创建/修改`,
          timestamp: new Date(),
        };
        this.messages.push(infoMsg);
        this.renderMessage(infoMsg);
      }
    }
  }

  private streamBuffer: string = "";
  private streamingMessageId: string | null = null;

  private handleStreamDelta(delta: string, done?: boolean): void {
    console.log(`[ChatPanel] handleStreamDelta: delta="${delta.substring(0, 50)}...", done=${done}, bufferLen=${this.streamBuffer.length}`);
    if (!this.streamingMessageId) {
      // 开始新的流式消息
      this.streamingMessageId = this.generateId();
      this.streamBuffer = "";

      const msg: ChatMessage = {
        id: this.streamingMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      this.messages.push(msg);
      this.renderMessage(msg, true);
    }

    this.streamBuffer += delta;

    // 更新消息内容
    if (done) {
      // 完成时，更新消息内容并移除光标
      this.updateStreamingMessage(this.streamingMessageId, this.streamBuffer, false);
      // 更新消息对象
      const msg = this.messages.find(m => m.id === this.streamingMessageId);
      if (msg) {
        msg.content = this.streamBuffer;
      }
      this.streamingMessageId = null;
      this.streamBuffer = "";
    } else {
      // 流式更新，带光标
      this.updateStreamingMessage(this.streamingMessageId, this.streamBuffer, true);
    }
  }

  private handleToolCall(data: ToolCallInfo): void {
    // 更新最后一条消息，添加工具调用信息
    const lastMsg = this.messages[this.messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      if (!lastMsg.toolCalls) lastMsg.toolCalls = [];
      lastMsg.toolCalls.push({ ...data, status: "running" });
      this.renderMessage(lastMsg);
    }
  }

  private handleToolResult(data: { id: string; result: unknown; error?: string }): void {
    // 更新工具调用状态
    const lastMsg = this.messages[this.messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant" && lastMsg.toolCalls) {
      const toolCall = lastMsg.toolCalls.find((t) => t.id === data.id);
      if (toolCall) {
        toolCall.result = data.result;
        toolCall.status = data.error ? "error" : "success";
        this.renderMessage(lastMsg);
      }
    }
  }

  private renderMessage(msg: ChatMessage, isStreaming: boolean = false): void {
    // 移除欢迎消息（如果有）
    const welcome = this.messagesContainer.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    // 查找现有消息元素
    let msgEl = this.messagesContainer.querySelector(`[data-id="${msg.id}"]`);

    if (!msgEl) {
      // 创建新消息元素
      msgEl = document.createElement("div");
      msgEl.className = `message ${msg.role}`;
      msgEl.setAttribute("data-id", msg.id);
      this.messagesContainer.appendChild(msgEl);
    }

    // 渲染消息内容
    const avatar = msg.role === "user" ? "👤" : "🤖";

    msgEl.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        <div class="message-text">${this.formatContent(msg.content)}${isStreaming ? '<span class="typing-cursor">▌</span>' : ''}</div>
        ${msg.toolCalls ? this.renderToolCalls(msg.toolCalls) : ''}
        <div class="message-meta">${this.formatTime(msg.timestamp)}</div>
      </div>
    `;

    // 滚动到底部
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private renderToolCalls(toolCalls: ToolCallInfo[]): string {
    return toolCalls
      .map(
        (tc) => `
      <div class="tool-call">
        <div class="tool-call-header">
          <span class="tool-icon">🔧</span>
          <span class="tool-name">${tc.name}</span>
          <span class="tool-call-status ${tc.status}">${tc.status}</span>
        </div>
        <div class="tool-call-body">
          <div class="tool-args">${this.escapeHtml(JSON.stringify(tc.arguments, null, 2))}</div>
          ${tc.result ? `<div class="tool-result">${this.escapeHtml(JSON.stringify(tc.result, null, 2))}</div>` : ""}
        </div>
      </div>
    `
      )
      .join("");
  }

  private updateStreamingMessage(id: string, content: string, showCursor: boolean = true): void {
    const msgEl = this.messagesContainer.querySelector(`[data-id="${id}"]`);
    if (msgEl) {
      const textEl = msgEl.querySelector(".message-text");
      if (textEl) {
        textEl.innerHTML = this.formatContent(content) + (showCursor ? '<span class="typing-cursor">▌</span>' : '');
      }
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  private showTypingIndicator(): void {
    const indicator = document.createElement("div");
    indicator.className = "message assistant typing-indicator-message";
    indicator.id = "typingIndicator";
    indicator.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(indicator);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private hideTypingIndicator(): void {
    const indicator = document.getElementById("typingIndicator");
    if (indicator) indicator.remove();
  }

  private formatContent(content: string): string {
    // 先处理代码块（避免内部内容被其他规则影响）
    let html = content;

    // 代码块 - 先用占位符替换
    const codeBlocks: string[] = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const index = codeBlocks.length;
      codeBlocks.push(`<pre class="code-block"><code class="language-${lang}">${this.escapeHtml(code.trim())}</code></pre>`);
      return `__CODE_BLOCK_${index}__`;
    });

    // 行内代码 - 用占位符替换
    const inlineCodes: string[] = [];
    html = html.replace(/`([^`]+)`/g, (_, code) => {
      const index = inlineCodes.length;
      inlineCodes.push(`<code class="inline-code">${this.escapeHtml(code)}</code>`);
      return `__INLINE_CODE_${index}__`;
    });

    // 转义 HTML（除了占位符）
    html = this.escapeHtml(html);

    // 恢复占位符
    codeBlocks.forEach((block, i) => {
      html = html.replace(`__CODE_BLOCK_${i}__`, block);
    });
    inlineCodes.forEach((code, i) => {
      html = html.replace(`__INLINE_CODE_${i}__`, code);
    });

    // 标题 (###, ##, #)
    html = html.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>');

    // 粗体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 斜体
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');

    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');

    // 将连续的 li 包装成 ul
    html = html.replace(/(<li class="md-li">.*<\/li>\n?)+/g, (match) => {
      return `<ul class="md-ul">${match}</ul>`;
    });

    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="md-link">$1</a>');

    // 分隔线
    html = html.replace(/^---$/gm, '<hr class="md-hr">');

    // 段落：将连续的非标签内容包装成 p
    // 先按换行分割，处理段落
    const lines = html.split('\n');
    const processedLines: string[] = [];
    let inParagraph = false;
    let paragraphContent = '';

    for (const line of lines) {
      const trimmed = line.trim();
      const isBlockElement = trimmed.startsWith('<h') ||
                            trimmed.startsWith('<ul') ||
                            trimmed.startsWith('<ol') ||
                            trimmed.startsWith('<pre') ||
                            trimmed.startsWith('<hr');

      if (isBlockElement || trimmed === '') {
        if (inParagraph && paragraphContent) {
          processedLines.push(`<p class="md-p">${paragraphContent}</p>`);
          paragraphContent = '';
          inParagraph = false;
        }
        if (trimmed !== '') {
          processedLines.push(trimmed);
        }
      } else {
        if (inParagraph) {
          paragraphContent += '<br>' + trimmed;
        } else {
          paragraphContent = trimmed;
          inParagraph = true;
        }
      }
    }

    if (inParagraph && paragraphContent) {
      processedLines.push(`<p class="md-p">${paragraphContent}</p>`);
    }

    html = processedLines.join('\n');

    return html;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }

  private getFileContext(): string | null {
    if (!this.editor || !this.currentFile) return null;
    const content = this.editor.getCurrentContent();
    if (!content) return null;
    // 限制上下文长度
    return content.length > 10000 ? content.slice(0, 10000) + "\n... (已截断)" : content;
  }

  setCurrentFile(path: string | null): void {
    this.currentFile = path;
    const contextFile = document.getElementById("contextFile");
    if (contextFile) {
      contextFile.textContent = path || "-";
    }
  }

  private updateSessionInfo(): void {
    const sessionInfo = document.getElementById("sessionInfo");
    const key = this.sessionKey || this.sessionId;
    if (sessionInfo && key) {
      sessionInfo.textContent = `会话: ${key.slice(0, 12)}...`;
    }
  }

  clear(): void {
    this.messages = [];
    this.sessionId = null;
    this.sessionKey = null;
    this.messagesContainer.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">🤖</div>
        <div class="welcome-text">
          <h3>欢迎使用 AgentBox IDE</h3>
          <p>我可以帮你：</p>
          <ul>
            <li>📝 编写和修改代码</li>
            <li>🔍 分析文件内容</li>
            <li>🔧 执行工具命令</li>
            <li>💡 解答编程问题</li>
          </ul>
          <p class="hint">输入消息开始对话，或使用 @ 引用当前文件</p>
        </div>
      </div>
    `;
    this.updateSessionInfo();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }
}
