/**
 * WebSocket 客户端
 */
import { Message, ToolDefinition, ConnectionOptions } from "./types";
type ConnectionHandler = (connected: boolean) => void;
export declare class AgentClient {
    private ws;
    private url;
    private options;
    private messageHandlers;
    private connectionHandlers;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private reconnectTimer;
    private logger;
    private tools;
    constructor(options: ConnectionOptions);
    /**
     * 连接到 Gateway
     */
    connect(): Promise<void>;
    /**
     * 断开连接
     */
    disconnect(): void;
    /**
     * 发送消息
     */
    send(message: Message): void;
    /**
     * 调用工具
     */
    callTool(toolName: string, params: Record<string, unknown>): Promise<unknown>;
    /**
     * 注册连接状态处理器
     */
    onConnectionChange(handler: ConnectionHandler): void;
    /**
     * 移除连接状态处理器
     */
    offConnectionChange(handler: ConnectionHandler): void;
    /**
     * 获取工具列表
     */
    getTools(): ToolDefinition[];
    /**
     * 是否已连接
     */
    isConnected(): boolean;
    private handleMessage;
    private handleReconnect;
    private notifyConnectionChange;
    private requestCapabilities;
    private generateId;
}
export {};
