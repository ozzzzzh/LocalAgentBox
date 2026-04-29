/**
 * Chat Panel 组件 - AI 对话界面
 */
import { AgentClient } from "./client.js";
import { CodeEditor } from "./codeEditor.js";
export declare class ChatPanel {
    private container;
    private messagesContainer;
    private input;
    private sendBtn;
    private client;
    private editor;
    private logger;
    private messages;
    private currentFile;
    private sessionId;
    private sessionKey;
    private isStreaming;
    private diffPanel;
    constructor(container: HTMLElement, messagesContainer: HTMLElement, input: HTMLTextAreaElement, sendBtn: HTMLButtonElement, client: AgentClient);
    setEditor(editor: CodeEditor): void;
    private init;
    /**
     * 订阅 session 的消息更新
     */
    private subscribeToSession;
    private sendMessage;
    private handleEvent;
    /**
     * 处理 session.message 事件
     */
    private handleSessionMessage;
    /**
     * 判断是否应该忽略该事件
     */
    private shouldIgnoreEvent;
    private thinkingIndicator;
    private showThinkingIndicator;
    private hideThinkingIndicator;
    /**
     * 刷新当前打开的文件
     */
    private refreshCurrentFile;
    /**
     * 处理工具调用事件
     */
    private handleToolEvent;
    /**
     * 判断是否是文件写入工具
     */
    private isFileWriteTool;
    private pendingFileModifications;
    /**
     * 检查并处理文件修改
     */
    private checkFileModifications;
    private streamBuffer;
    private streamingMessageId;
    private handleStreamDelta;
    private handleToolCall;
    private handleToolResult;
    private renderMessage;
    private renderToolCalls;
    private updateStreamingMessage;
    private showTypingIndicator;
    private hideTypingIndicator;
    private formatContent;
    private formatTime;
    private getFileContext;
    setCurrentFile(path: string | null): void;
    private updateSessionInfo;
    clear(): void;
    private escapeHtml;
    private generateId;
}
