/**
 * 工具面板组件
 */
import { AgentClient } from "./client.js";
export declare class ToolsPanel {
    private container;
    private client;
    private logger;
    private nodeId;
    constructor(container: HTMLElement, client: AgentClient);
    private findNode;
    render(): void;
    private groupTools;
    private getCategory;
    private getToolIcon;
    private showToolDialog;
    private renderParams;
    private getInputType;
    private executeTool;
}
