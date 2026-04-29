/**
 * OpenClaw Gateway WebSocket 客户端
 * 适配 OpenClaw 帧协议 (req/res/event)
 */

import {
  RequestFrame,
  ResponseFrame,
  EventFrame,
  Frame,
  ConnectParams,
  ToolDefinition,
  ConnectionOptions,
  NodeInfo,
  SkillInfo,
} from "./types.js";
import { Logger } from "./logger.js";

type ResponseHandler = (frame: ResponseFrame) => void;
type ConnectionHandler = (connected: boolean) => void;
type EventHandler = (event: string, payload: unknown) => void;

export class AgentClient {
  private ws: WebSocket | null = null;
  private url: string = "";
  private options: ConnectionOptions;
  private responseHandlers: Map<string, ResponseHandler> = new Map();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private eventHandlers: Set<EventHandler> = new Set();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private logger: Logger;
  private tools: ToolDefinition[] = [];
  private skills: SkillInfo[] = [];
  private nodes: NodeInfo[] = [];
  private connected = false;
  private _sessionId = 0;
  private connectNonce: string | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

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

        // 重置连接状态
        this.connectNonce = null;
        this.connectResolve = null;
        this.connectReject = null;

        this.ws.onopen = () => {
          this.logger.info("WebSocket 已建立，等待 connect.challenge...");
          this._sessionId++;
          // Gateway 会先发送 connect.challenge 事件
          // 我们在 handleFrame 中处理它并发送 connect 帧
        };

        this.ws.onclose = (event) => {
          this.logger.warning(`连接已关闭: ${event.code} ${event.reason}`);
          this.connected = false;
          this.notifyConnectionChange(false);
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          this.logger.error("连接错误");
          if (!this.connected) {
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleFrame(event.data);
        };

        // 设置 connect 流程的 resolve/reject
        this.connectResolve = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.notifyConnectionChange(true);
          this.logger.success("已连接到 Gateway");
          resolve();
        };

        this.connectReject = (err) => {
          this.logger.error("connect 帧失败", err);
          reject(err);
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

    this.connected = false;
    this.logger.info("已断开连接");
    this.notifyConnectionChange(false);
  }

  /**
   * 发送 connect 帧（握手）
   */
  private sendConnect(): void {
    const connectParams: ConnectParams = {
      minProtocol: 1,
      maxProtocol: 3, // OpenClaw 要求 maxProtocol >= 3
      client: {
        id: "openclaw-control-ui",
        mode: "ui",
        version: "0.1.0",
        platform: "web",
        displayName: "AgentBox Frontend",
      },
      role: "operator", // operator 角色 + token 认证可跳过设备身份验证
      scopes: [
        "operator.read",
        "operator.write",
        "operator.admin",
        "operator.approvals",
        "operator.pairing",
      ],
    };

    if (this.options.apiKey) {
      connectParams.auth = { token: this.options.apiKey };
    }

    // 发送 connect 帧（不等待响应，响应在 handleFrame 中处理）
    this.requestNoWait("connect", connectParams);
    this.logger.debug("已发送 connect 帧");
  }

  /**
   * 发送请求帧（不等待响应，由 handleFrame 处理）
   */
  private requestNoWait(method: string, params?: unknown): void {
    const id = this.generateId();
    const frame: RequestFrame = { type: "req", id, method, params };
    this.sendFrame(frame);
    this.logger.debug(`发送 req: ${method}`, params);
  }

  /**
   * 发送请求帧并等待响应
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();
      const frame: RequestFrame = { type: "req", id, method, params };

      const timeout = setTimeout(() => {
        this.responseHandlers.delete(id);
        reject(new Error(`请求超时: ${method}`));
      }, 30000);

      this.responseHandlers.set(id, (res: ResponseFrame) => {
        clearTimeout(timeout);
        if (res.ok) {
          resolve(res.payload);
        } else {
          const errMsg = res.error?.message || `请求失败: ${method}`;
          reject(new Error(errMsg));
        }
      });

      this.sendFrame(frame);
      this.logger.debug(`发送 req: ${method}`, params);
    });
  }

  /**
   * 调用节点上的工具命令
   */
  async invokeNodeCommand(
    nodeId: string,
    command: string,
    params?: unknown
  ): Promise<unknown> {
    return this.request("node.invoke", {
      nodeId,
      command,
      params,
      idempotencyKey: this.generateId(),
    });
  }

  /**
   * 获取工具目录
   */
  async fetchToolsCatalog(): Promise<void> {
    try {
      const result = (await this.request("tools.catalog", {})) as {
        tools?: ToolDefinition[];
      };
      if (result && Array.isArray(result.tools)) {
        this.tools = result.tools;
      } else if (Array.isArray(result)) {
        this.tools = result as unknown as ToolDefinition[];
      }
      this.logger.info(`已加载 ${this.tools.length} 个工具`);
    } catch (error) {
      this.logger.warning("获取工具目录失败", error);
    }
  }

  /**
   * 获取节点列表
   */
  async fetchNodes(): Promise<void> {
    try {
      const result = (await this.request("node.list", {})) as {
        nodes?: NodeInfo[];
      };
      if (result && Array.isArray(result.nodes)) {
        this.nodes = result.nodes;
      } else if (Array.isArray(result)) {
        this.nodes = result as unknown as NodeInfo[];
      }
      this.logger.info(`已加载 ${this.nodes.length} 个节点`);
    } catch (error) {
      this.logger.warning("获取节点列表失败", error);
    }
  }

  /**
   * 获取工具列表（缓存）
   */
  getTools(): ToolDefinition[] {
    return this.tools;
  }

  /**
   * 获取节点列表（缓存）
   */
  getNodes(): NodeInfo[] {
    return this.nodes;
  }

  /**
   * 获取技能列表（缓存）
   */
  getSkills(): SkillInfo[] {
    return this.skills;
  }

  /**
   * 获取技能状态
   */
  async fetchSkills(): Promise<void> {
    try {
      const result = (await this.request("skills.status", {})) as {
        skills?: SkillInfo[];
      };
      if (result && Array.isArray(result.skills)) {
        this.skills = result.skills;
      }
      this.logger.info(`已加载 ${this.skills.length} 个技能`);
    } catch (error) {
      this.logger.warning("获取技能列表失败", error);
    }
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.connected;
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
   * 注册事件处理器
   */
  onEvent(handler: EventHandler): void {
    this.eventHandlers.add(handler);
  }

  // ===== 私有方法 =====

  private sendFrame(frame: RequestFrame): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    } else {
      this.logger.error("未连接，无法发送帧");
    }
  }

  private handleFrame(data: string): void {
    try {
      const frame: Frame = JSON.parse(data);

      switch (frame.type) {
        case "res": {
          const res = frame as ResponseFrame;
          this.logger.debug(`收到 res: ok=${res.ok}`, res.payload);

          // 如果这是 connect 的响应
          if (!this.connected && this.connectResolve && this.connectReject) {
            if (res.ok) {
              this.connectResolve();
            } else {
              this.connectReject(new Error(res.error?.message || "connect 失败"));
            }
            this.connectResolve = null;
            this.connectReject = null;
            return;
          }

          const handler = this.responseHandlers.get(res.id);
          if (handler) {
            handler(res);
            this.responseHandlers.delete(res.id);
          }
          break;
        }

        case "event": {
          const evt = frame as EventFrame;
          this.logger.debug(`收到 event: ${evt.event}`, evt.payload);

          // 处理 connect.challenge 事件
          if (evt.event === "connect.challenge") {
            const payload = evt.payload as { nonce?: string; ts?: number };
            if (payload && typeof payload.nonce === "string") {
              this.connectNonce = payload.nonce;
              this.logger.debug(`收到 challenge nonce: ${this.connectNonce}`);
              // 收到 challenge 后发送 connect 帧
              this.sendConnect();
            } else {
              this.logger.error("connect.challenge 缺少 nonce");
              if (this.connectReject) {
                this.connectReject(new Error("connect.challenge 缺少 nonce"));
              }
            }
            return;
          }

          this.eventHandlers.forEach((h) => h(evt.event, evt.payload));
          break;
        }

        case "req": {
          // Gateway 主动发来的请求
          this.logger.debug(`收到入站 req: ${(frame as RequestFrame).method}`);
          break;
        }

        default:
          this.logger.debug(`收到未知帧: ${(frame as { type: string }).type}`);
      }
    } catch (error) {
      this.logger.error("解析帧失败", error);
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

    this.logger.info(
      `${delay / 1000}秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionHandlers.forEach((handler) => handler(connected));
  }

  private generateId(): string {
    return `${this._sessionId}-${Math.random().toString(36).substring(2, 10)}`;
  }
}
