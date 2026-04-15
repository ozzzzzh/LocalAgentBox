/**
 * WebSocket 客户端
 */
import { Logger } from "./logger";
export class AgentClient {
    constructor(options) {
        this.ws = null;
        this.url = "";
        this.messageHandlers = new Map();
        this.connectionHandlers = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.reconnectTimer = null;
        this.tools = [];
        this.options = options;
        this.logger = Logger.getInstance();
    }
    /**
     * 连接到 Gateway
     */
    async connect() {
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
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * 断开连接
     */
    disconnect() {
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
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            this.logger.debug(`发送: ${message.type}`, message.payload);
        }
        else {
            this.logger.error("未连接，无法发送消息");
        }
    }
    /**
     * 调用工具
     */
    async callTool(toolName, params) {
        const id = this.generateId();
        const message = {
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
                    reject(new Error(response.payload.error));
                }
                else {
                    resolve(response.payload);
                }
            });
            this.send(message);
        });
    }
    /**
     * 注册连接状态处理器
     */
    onConnectionChange(handler) {
        this.connectionHandlers.add(handler);
    }
    /**
     * 移除连接状态处理器
     */
    offConnectionChange(handler) {
        this.connectionHandlers.delete(handler);
    }
    /**
     * 获取工具列表
     */
    getTools() {
        return this.tools;
    }
    /**
     * 是否已连接
     */
    isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
    // ===== 私有方法 =====
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            this.logger.debug(`收到: ${message.type}`, message.payload);
            // 处理能力响应
            if (message.type === "capabilities") {
                this.tools = message.payload.tools || [];
                this.logger.info(`已加载 ${this.tools.length} 个工具`);
            }
            // 分发到注册的处理器
            const handler = this.messageHandlers.get(message.id);
            if (handler) {
                handler(message);
                this.messageHandlers.delete(message.id);
            }
        }
        catch (error) {
            this.logger.error("解析消息失败", error);
        }
    }
    handleReconnect() {
        if (!this.options.autoReconnect)
            return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error("达到最大重连次数，停止重连");
            return;
        }
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        this.logger.info(`${delay / 1000}秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(() => { });
        }, delay);
    }
    notifyConnectionChange(connected) {
        this.connectionHandlers.forEach((handler) => handler(connected));
    }
    requestCapabilities() {
        const message = {
            type: "capabilities",
            id: this.generateId(),
            payload: {},
        };
        this.send(message);
    }
    generateId() {
        return Math.random().toString(36).substring(2, 10);
    }
}
//# sourceMappingURL=client.js.map