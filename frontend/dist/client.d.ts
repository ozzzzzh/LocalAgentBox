/**
 * OpenClaw Gateway WebSocket 客户端
 * 适配 OpenClaw 帧协议 (req/res/event)
 */
import { ToolDefinition, ConnectionOptions, NodeInfo } from "./types.js";
type ConnectionHandler = (connected: boolean) => void;
type EventHandler = (event: string, payload: unknown) => void;
export declare class AgentClient {
    private ws;
    private url;
    private options;
    private responseHandlers;
    private connectionHandlers;
    private eventHandlers;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private reconnectTimer;
    private logger;
    private tools;
    private nodes;
    private connected;
    private _sessionId;
    private connectNonce;
    private connectResolve;
    private connectReject;
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
     * 发送 connect 帧（握手）
     */
    private sendConnect;
    /**
     * 发送请求帧（不等待响应，由 handleFrame 处理）
     */
    private requestNoWait;
    /**
     * 发送请求帧并等待响应
     */
    request(method: string, params?: unknown): Promise<unknown>;
    /**
     * 调用节点上的工具命令
     */
    invokeNodeCommand(nodeId: string, command: string, params?: unknown): Promise<unknown>;
    /**
     * 获取工具目录
     */
    fetchToolsCatalog(): Promise<void>;
    /**
     * 获取节点列表
     */
    fetchNodes(): Promise<void>;
    /**
     * 获取工具列表（缓存）
     */
    getTools(): ToolDefinition[];
    /**
     * 获取节点列表（缓存）
     */
    getNodes(): NodeInfo[];
    /**
     * 是否已连接
     */
    isConnected(): boolean;
    /**
     * 注册连接状态处理器
     */
    onConnectionChange(handler: ConnectionHandler): void;
    /**
     * 移除连接状态处理器
     */
    offConnectionChange(handler: ConnectionHandler): void;
    /**
     * 注册事件处理器
     */
    onEvent(handler: EventHandler): void;
    private sendFrame;
    private handleFrame;
    private handleReconnect;
    private notifyConnectionChange;
    private generateId;
}
export {};
