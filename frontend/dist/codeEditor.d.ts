/**
 * 代码编辑器组件
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
    openFile(path: string): Promise<void>;
    save(): Promise<void>;
    closeFile(path: string): void;
    getCurrentFile(): string | null;
    private switchToFile;
    private renderTabs;
    private updateLineNumbers;
    private updateCursorPosition;
    private updateFileInfo;
    private markModified;
    private triggerCompletion;
    private createCompletionBox;
    private showCompletions;
    private insertCompletion;
    private hideCompletions;
    private getKindIcon;
    private escapeHtml;
}
