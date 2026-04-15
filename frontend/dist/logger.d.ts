/**
 * 日志管理器
 */
export type LogLevel = "debug" | "info" | "success" | "warning" | "error";
export interface LogEntry {
    time: string;
    level: LogLevel;
    message: string;
    data?: unknown;
}
export declare class Logger {
    private static instance;
    private container;
    private entries;
    private maxEntries;
    private constructor();
    static getInstance(): Logger;
    setContainer(container: HTMLElement): void;
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    success(message: string, data?: unknown): void;
    warning(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
    clear(): void;
    getEntries(): LogEntry[];
    private log;
    private formatTime;
    private render;
    private escapeHtml;
}
