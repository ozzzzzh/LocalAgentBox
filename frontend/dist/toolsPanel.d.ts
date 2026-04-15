/**
 * 工具面板组件
 */
import { AgentClient } from "./client";
export declare class ToolsPanel {
    private container;
    private client;
    private logger;
    constructor(container: HTMLElement, client: AgentClient);
    render(): void;
    private groupTools;
    private getCategory;
    private getToolIcon;
    private showToolDialog;
    private renderParams;
    private getInputType;
    private executeTool;
}
