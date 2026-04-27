/**
 * 文件浏览器组件
 * 使用 system.run 执行 shell 命令来实现文件操作
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
     * 查找可用的节点
     */
    private findNode;
    setOnFileSelect(handler: (path: string) => void): void;
    refresh(path?: string): Promise<void>;
    /**
     * 获取父目录路径
     */
    private getParentPath;
    /**
     * 执行 shell 命令
     */
    private runCommand;
    /**
     * 解析 ls -la 输出为文件列表
     */
    private parseLsOutput;
    search(pattern: string): Promise<void>;
    private render;
    private renderSearchResults;
    private getFileIcon;
    private formatSize;
    private escapeHtml;
}
