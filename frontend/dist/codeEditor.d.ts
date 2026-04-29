/**
 * 代码编辑器组件
 * 使用 system.run 执行 shell 命令来实现文件操作
 */
import { AgentClient } from "./client.js";
export declare class CodeEditor {
    private container;
    private lineNumbers;
    private tabsContainer;
    private cursorPosition;
    private fileInfo;
    private client;
    private logger;
    private openFiles;
    private currentFile;
    private completions;
    private completionBox;
    private nodeId;
    constructor(container: HTMLTextAreaElement, lineNumbers: HTMLElement, tabsContainer: HTMLElement, cursorPosition: HTMLElement, fileInfo: HTMLElement, client: AgentClient);
    private findNode;
    private init;
    /**
     * 执行 shell 命令
     */
    private runCommand;
    openFile(path: string): Promise<void>;
    save(): Promise<void>;
    /**
     * 创建新文件
     */
    createFile(path: string): Promise<boolean>;
    closeFile(path: string): void;
    getCurrentFile(): string | null;
    getCurrentContent(): string | null;
    setContent(content: string): void;
    /**
     * 刷新当前文件内容（从磁盘重新读取）
     */
    refreshCurrentFile(): Promise<string | null>;
    /**
     * 检查文件是否已打开
     */
    isOpen(path: string): boolean;
    /**
     * 刷新指定文件（如果已打开）
     */
    refreshFile(path: string): Promise<{
        oldContent: string;
        newContent: string;
    } | null>;
    private switchToFile;
    private renderTabs;
    private updateLineNumbers;
    private updateCursorPosition;
    private updateFileInfo;
    private markModified;
    private createCompletionBox;
    private hideCompletions;
    private getKindIcon;
    private escapeHtml;
}
