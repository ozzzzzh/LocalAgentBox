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

export class Logger {
  private static instance: Logger;
  private container: HTMLElement | null = null;
  private entries: LogEntry[] = [];
  private maxEntries: number = 500;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setContainer(container: HTMLElement): void {
    this.container = container;
    this.render();
  }

  debug(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  success(message: string, data?: unknown): void {
    this.log("success", message, data);
  }

  warning(message: string, data?: unknown): void {
    this.log("warning", message, data);
  }

  error(message: string, data?: unknown): void {
    this.log("error", message, data);
  }

  clear(): void {
    this.entries = [];
    this.render();
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      time: this.formatTime(new Date()),
      level,
      message,
      data,
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    this.render();
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  private render(): void {
    if (!this.container) return;

    const html = this.entries
      .map(
        (entry) => `
        <div class="log-entry ${entry.level}">
          <span class="log-time">${entry.time}</span>
          <span class="log-type">${entry.level.toUpperCase()}</span>
          <span class="log-message">${this.escapeHtml(entry.message)}</span>
        </div>
      `
      )
      .join("");

    this.container.innerHTML = html;
    this.container.scrollTop = this.container.scrollHeight;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
