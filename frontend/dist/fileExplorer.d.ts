/**
 * 文件浏览器组件
 */
import { AgentClient } from "./client.js";
export declare class FileExplorer {
    private container;
    private client;
    private logger;
    private currentPath;
    private onFileSelect;
    private nodeId;
    constructor(container: HTMLElement, client: AgentClient);
    /**
     * 查找可用的节点（通常是 node-host 或类似的本地执行节点）
     */
    private findNode;
    setOnFileSelect(handler: (path: string) => void): void;
    refresh(path?: string): Promise<void>;
    search(pattern: string): Promise<void>;
    private render;
    private renderSearchResults;
    private getFileIcon;
    private formatSize;
    private escapeHtml;
}
