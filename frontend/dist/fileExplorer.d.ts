/**
 * 文件浏览器组件
 */
import { AgentClient } from "./client";
export declare class FileExplorer {
    private container;
    private client;
    private logger;
    private currentPath;
    private onFileSelect;
    constructor(container: HTMLElement, client: AgentClient);
    setOnFileSelect(handler: (path: string) => void): void;
    refresh(path?: string): Promise<void>;
    search(pattern: string): Promise<void>;
    private render;
    private renderSearchResults;
    private getFileIcon;
    private formatSize;
    private escapeHtml;
}
