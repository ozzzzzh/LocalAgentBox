/**
 * 消息类型定义
 */
export type MessageType = "file.read" | "file.write" | "file.list" | "file.delete" | "file.exists" | "file.info" | "file.search" | "file.move" | "file.copy" | "code.complete" | "code.diagnose" | "editor.open" | "editor.list" | "workspace.info" | "capabilities" | "tool.call" | "response" | "error" | "ping" | "pong";
export interface Message {
    type: MessageType;
    id: string;
    payload: Record<string, unknown>;
}
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
