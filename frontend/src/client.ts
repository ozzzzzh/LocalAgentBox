/**
 * WebSocket 客户端
 */

import { Message, ToolDefinition, ConnectionOptions } from "./types";
import { Logger } from "./logger";

type MessageHandler = (message: Message) => void;
type ConnectionHandler = (connected: boolean) => void;

export class AgentClient {
  private ws: WebSocket | null = null;
  private url: string = "";
  private options: ConnectionOptions;
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private logger: Logger;
  private tools: ToolDefinition[] = [];

  constructor(options: ConnectionOptions) {
    this.options = options;
    this.logger = Logger.getInstance();
  }

  /**
   * 连接到 Gateway
   */
  async connect(): Promise<void> {
    this.url = this.options.useTls
      ? this.options.gatewayUrl.replace("ws://", "wss://")
      : this.options.gatewayUrl;

    if (!this.url.startsWith("ws://") && !this.url.startsWith("wss://")) {
      this.url = `ws://${this.url}`;
    }

    return new Promise((resolve, reject) => {
      try {
        this.logger.info(`正在连接到 ${this.url}...`);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.logger.success("已连接到 Gateway");
          this.reconnectAttempts = 0;
          this.notifyConnectionChange(true);

          // 发送能力请求
          this.requestCapabilities();

          resolve();
        };

        this.ws.onclose = (event) => {
          this.logger.warning(`连接已关闭: ${event.code} ${event.reason}`);
          this.notifyConnectionChange(false);
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          this.logger.error("连接错误");
          reject(error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.logger.info("已断开连接");
    this.notifyConnectionChange(false);
  }

  /**
   * 发送消息
   */
  send(message: Message): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      this.logger.debug(`发送: ${message.type}`, message.payload);
    } else {
      this.logger.error("未连接，无法发送消息");
    }
  }

  /**
   * 调用工具
   */
  async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.generateId();
    const message: Message = {
      type: "tool.call",
      id,
      payload: {
        tool: toolName,
        params,
      },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageHandlers.delete(id);
        reject(new Error("工具调用超时"));
      }, 30000);

      this.messageHandlers.set(id, (response) => {
        clearTimeout(timeout);
        if (response.type === "error") {
          reject(new Error(response.payload.error as string));
        } else {
          resolve(response.payload);
        }
      });

      this.send(message);
    });
  }

  /**
   * 注册连接状态处理器
   */
  onConnectionChange(handler: ConnectionHandler): void {
    this.connectionHandlers.add(handler);
  }

  /**
   * 移除连接状态处理器
   */
  offConnectionChange(handler: ConnectionHandler): void {
    this.connectionHandlers.delete(handler);
  }

  /**
   * 获取工具列表
   */
  getTools(): ToolDefinition[] {
    return this.tools;
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ===== 私有方法 =====

  private handleMessage(data: string): void {
    try {
      const message: Message = JSON.parse(data);
      this.logger.debug(`收到: ${message.type}`, message.payload);

      // 处理能力响应
      if (message.type === "capabilities") {
        this.tools = (message.payload.tools as ToolDefinition[]) || [];
        this.logger.info(`已加载 ${this.tools.length} 个工具`);
      }

      // 分发到注册的处理器
      const handler = this.messageHandlers.get(message.id);
      if (handler) {
        handler(message);
        this.messageHandlers.delete(message.id);
      }
    } catch (error) {
      this.logger.error("解析消息失败", error);
    }
  }

  private handleReconnect(): void {
    if (!this.options.autoReconnect) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error("达到最大重连次数，停止重连");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    this.logger.info(`${delay / 1000}秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionHandlers.forEach((handler) => handler(connected));
  }

  private requestCapabilities(): void {
    const message: Message = {
      type: "capabilities",
      id: this.generateId(),
      payload: {},
    };
    this.send(message);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}
