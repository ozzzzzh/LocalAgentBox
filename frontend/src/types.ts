/**
 * OpenClaw Gateway 帧协议类型定义
 */

// ===== 帧协议类型 =====

export interface RequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface EventFrame {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
}

export type Frame = RequestFrame | ResponseFrame | EventFrame;

// ===== Connect 参数 =====

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    mode: string;
    version: string;
    platform: string;
    displayName?: string;
  };
  auth?: {
    token?: string;
    password?: string;
  };
  role?: string;
  scopes?: string[];
  caps?: string[];
}

// ===== 业务类型 =====

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  returns?: string;
}

export interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: number;
  extension?: string;
}

export interface CompletionItem {
  text: string;
  display_text: string;
  kind: string;
  detail?: string;
  documentation?: string;
  insert_text?: string;
}

export interface Diagnostic {
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface ConnectionOptions {
  gatewayUrl: string;
  workspace?: string;
  apiKey?: string;
  useTls?: boolean;
  autoReconnect?: boolean;
}

// ===== 节点信息 =====

export interface NodeInfo {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  caps?: string[];
  commands?: string[];
  online?: boolean;
}
