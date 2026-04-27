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
            // 发送消息到 Gateway
            const result = await this.client.request("send", {
                message: content,
                sessionId: this.sessionId,
            });
            this.hideTypingIndicator();
            // 处理响应
            if (result && typeof result === "object") {
                const response = result;
                // 保存会话 ID
                if (response.sessionId) {
                    this.sessionId = response.sessionId;
                    this.updateSessionInfo();
                }
                // 添加助手消息
                const assistantContent = response.text || response.content || JSON.stringify(result, null, 2);
                const assistantMsg = {
                    id: this.generateId(),
                    role: "assistant",
                    content: assistantContent,
                    timestamp: new Date(),
                };
                this.messages.push(assistantMsg);
                this.renderMessage(assistantMsg);
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
        // 处理流式消息事件
        if (event === "message" || event === "agent.message") {
            const data = payload;
            if (data.text || data.delta) {
                this.handleStreamDelta(data.text || data.delta || "", data.done);
            }
        }
        // 处理工具调用事件
        if (event === "tool.call" || event === "agent.tool_call") {
            const data = payload;
            this.handleToolCall({ ...data, status: "running" });
        }
        // 处理工具结果事件
        if (event === "tool.result" || event === "agent.tool_result") {
            const data = payload;
            this.handleToolResult(data);
        }
        // 处理文件修改事件
        if (event === "file.modified" || event === "workspace.file_changed") {
            const data = payload;
            if (this.editor && data.path === this.currentFile) {
                this.logger.info(`文件 ${data.path} 已被修改`);
                // 可以选择重新加载文件
            }
        }
    }
    handleStreamDelta(delta, done) {
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
        this.updateStreamingMessage(this.streamingMessageId, this.streamBuffer);
        if (done) {
            this.streamingMessageId = null;
            this.streamBuffer = "";
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
    updateStreamingMessage(id, content) {
        const msgEl = this.messagesContainer.querySelector(`[data-id="${id}"]`);
        if (msgEl) {
            const textEl = msgEl.querySelector(".message-text");
            if (textEl) {
                textEl.innerHTML = this.formatContent(content) + '<span class="typing-cursor">▌</span>';
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
        // 简单的 Markdown 渲染
        let html = this.escapeHtml(content);
        // 代码块
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
        });
        // 行内代码
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // 粗体
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // 斜体
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        // 换行
        html = html.replace(/\n/g, '<br>');
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
        if (sessionInfo && this.sessionId) {
            sessionInfo.textContent = `会话: ${this.sessionId.slice(0, 8)}...`;
        }
    }
    clear() {
        this.messages = [];
        this.sessionId = null;
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