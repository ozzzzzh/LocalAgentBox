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
    private isStreaming;
    constructor(container: HTMLElement, messagesContainer: HTMLElement, input: HTMLTextAreaElement, sendBtn: HTMLButtonElement, client: AgentClient);
    setEditor(editor: CodeEditor): void;
    private init;
    private sendMessage;
    private handleEvent;
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
