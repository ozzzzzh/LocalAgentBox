/**
 * Chat Panel 组件 - AI 对话界面
 */
import { Logger } from "./logger.js";
export class ChatPanel {
    constructor(container, messagesContainer, input, sendBtn, client) {
        this.editor = null;
        this.messages = [];
        this.currentFile = null;
        this.sessionId = null;
        this.sessionKey = null;
        this.isStreaming = false;
        this.streamBuffer = "";
        this.streamingMessageId = null;
        this.container = container;
        this.messagesContainer = messagesContainer;
        this.input = input;
        this.sendBtn = sendBtn;
        this.client = client;
        this.logger = Logger.getInstance();
        this.init();
    }
    setEditor(editor) {
        this.editor = editor;
    }
    init() {
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
    async subscribeToSession(key) {
        try {
            await this.client.request("sessions.messages.subscribe", { key });
            this.logger.info(`已订阅会话: ${key}`);
        }
        catch (error) {
            this.logger.warning("订阅会话失败", error);
        }
    }
    async sendMessage() {
        const text = this.input.value.trim();
        if (!text || this.isStreaming)
            return;
        // 清空输入框
        this.input.value = "";
        // 构建消息内容（包含文件引用）
        let content = text;
        const fileContext = this.getFileContext();
        if (fileContext) {
            content = `${text}\n\n[当前文件: ${this.currentFile}]\n\`\`\`\n${fileContext}\n\`\`\``;
        }
        // 添加用户消息
        const userMsg = {
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
            // 需要先有 sessionKey，格式为 "agent:<agentId>:<sessionId>"
            // 如果没有 sessionKey，先创建或获取一个
            if (!this.sessionKey) {
                // 尝试获取或创建 session
                const sessionsResult = await this.client.request("sessions.list", {});
                // 查找 main agent 的 session
                if (sessionsResult.sessions && sessionsResult.sessions.length > 0) {
                    const mainSession = sessionsResult.sessions.find(s => s.agentId === "main" || s.key?.includes("main"));
                    if (mainSession) {
                        this.sessionKey = mainSession.key;
                        // 订阅消息
                        await this.subscribeToSession(this.sessionKey);
                    }
                }
                // 如果没有找到，创建一个新的 session
                if (!this.sessionKey) {
                    const createResult = await this.client.request("sessions.create", {
                        agentId: "main",
                        message: content,
                    });
                    if (createResult.key) {
                        this.sessionKey = createResult.key;
                        this.updateSessionInfo();
                        // 订阅消息
                        await this.subscribeToSession(this.sessionKey);
                    }
                }
            }
            // 发送消息
            const result = await this.client.request("sessions.send", {
                key: this.sessionKey || "agent:main:main",
                message: content,
                idempotencyKey: this.generateId(),
            });
            this.hideTypingIndicator();
            // 处理响应 - sessions.send 返回的是消息处理结果
            // 响应可能是流式的，通过事件接收，这里处理同步返回的情况
            if (result && typeof result === "object") {
                const response = result;
                // 更新 sessionKey
                if (response.key) {
                    this.sessionKey = response.key;
                    this.updateSessionInfo();
                }
            }
        }
        catch (error) {
            this.hideTypingIndicator();
            this.logger.error("发送消息失败", error);
            // 显示错误消息
            const errorMsg = {
                id: this.generateId(),
                role: "assistant",
                content: `❌ 发送失败: ${error}`,
                timestamp: new Date(),
            };
            this.messages.push(errorMsg);
            this.renderMessage(errorMsg);
        }
        finally {
            this.isStreaming = false;
        }
    }
    handleEvent(event, payload) {
        console.log(`[ChatPanel] Event: ${event}`, JSON.stringify(payload, null, 2));
        this.logger.debug(`收到事件: ${event}`, payload);
        // 主要使用 agent 事件处理流式回复
        if (event === "agent") {
            const data = payload;
            // stream: "assistant" 包含 AI 回复的增量
            if (data.stream === "assistant" && data.data) {
                const delta = data.data.delta || "";
                if (delta) {
                    this.handleStreamDelta(delta, false);
                }
            }
            // stream: "lifecycle" phase: "end" 表示回复完成
            if (data.stream === "lifecycle" && data.data?.phase === "end") {
                this.handleStreamDelta("", true);
            }
        }
        // chat 事件只用于确认最终状态，不重复渲染
        // session.message 的 assistant 消息也不处理，避免重复
        // 处理文件修改事件
        if (event === "file.modified" || event === "workspace.file_changed") {
            const data = payload;
            if (this.editor && data.path === this.currentFile) {
                this.logger.info(`文件 ${data.path} 已被修改`);
            }
        }
    }
    handleStreamDelta(delta, done) {
        console.log(`[ChatPanel] handleStreamDelta: delta="${delta.substring(0, 50)}...", done=${done}, bufferLen=${this.streamBuffer.length}`);
        if (!this.streamingMessageId) {
            // 开始新的流式消息
            this.streamingMessageId = this.generateId();
            this.streamBuffer = "";
            const msg = {
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
        }
        else {
            // 流式更新，带光标
            this.updateStreamingMessage(this.streamingMessageId, this.streamBuffer, true);
        }
    }
    handleToolCall(data) {
        // 更新最后一条消息，添加工具调用信息
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
            if (!lastMsg.toolCalls)
                lastMsg.toolCalls = [];
            lastMsg.toolCalls.push({ ...data, status: "running" });
            this.renderMessage(lastMsg);
        }
    }
    handleToolResult(data) {
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
    renderMessage(msg, isStreaming = false) {
        // 移除欢迎消息（如果有）
        const welcome = this.messagesContainer.querySelector(".welcome-message");
        if (welcome)
            welcome.remove();
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
    renderToolCalls(toolCalls) {
        return toolCalls
            .map((tc) => `
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
    `)
            .join("");
    }
    updateStreamingMessage(id, content, showCursor = true) {
        const msgEl = this.messagesContainer.querySelector(`[data-id="${id}"]`);
        if (msgEl) {
            const textEl = msgEl.querySelector(".message-text");
            if (textEl) {
                textEl.innerHTML = this.formatContent(content) + (showCursor ? '<span class="typing-cursor">▌</span>' : '');
            }
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }
    showTypingIndicator() {
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
    hideTypingIndicator() {
        const indicator = document.getElementById("typingIndicator");
        if (indicator)
            indicator.remove();
    }
    formatContent(content) {
        // 先处理代码块（避免内部内容被其他规则影响）
        let html = content;
        // 代码块 - 先用占位符替换
        const codeBlocks = [];
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            const index = codeBlocks.length;
            codeBlocks.push(`<pre class="code-block"><code class="language-${lang}">${this.escapeHtml(code.trim())}</code></pre>`);
            return `__CODE_BLOCK_${index}__`;
        });
        // 行内代码 - 用占位符替换
        const inlineCodes = [];
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
        const processedLines = [];
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
            }
            else {
                if (inParagraph) {
                    paragraphContent += '<br>' + trimmed;
                }
                else {
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
    formatTime(date) {
        return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    getFileContext() {
        if (!this.editor || !this.currentFile)
            return null;
        const content = this.editor.getCurrentContent();
        if (!content)
            return null;
        // 限制上下文长度
        return content.length > 10000 ? content.slice(0, 10000) + "\n... (已截断)" : content;
    }
    setCurrentFile(path) {
        this.currentFile = path;
        const contextFile = document.getElementById("contextFile");
        if (contextFile) {
            contextFile.textContent = path || "-";
        }
    }
    updateSessionInfo() {
        const sessionInfo = document.getElementById("sessionInfo");
        const key = this.sessionKey || this.sessionId;
        if (sessionInfo && key) {
            sessionInfo.textContent = `会话: ${key.slice(0, 12)}...`;
        }
    }
    clear() {
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
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    }
}
//# sourceMappingURL=chatPanel.js.map