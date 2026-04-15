/**
 * 日志管理器
 */
export class Logger {
    constructor() {
        this.container = null;
        this.entries = [];
        this.maxEntries = 500;
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    setContainer(container) {
        this.container = container;
        this.render();
    }
    debug(message, data) {
        this.log("info", message, data);
    }
    info(message, data) {
        this.log("info", message, data);
    }
    success(message, data) {
        this.log("success", message, data);
    }
    warning(message, data) {
        this.log("warning", message, data);
    }
    error(message, data) {
        this.log("error", message, data);
    }
    clear() {
        this.entries = [];
        this.render();
    }
    getEntries() {
        return [...this.entries];
    }
    log(level, message, data) {
        const entry = {
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
    formatTime(date) {
        return date.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }
    render() {
        if (!this.container)
            return;
        const html = this.entries
            .map((entry) => `
        <div class="log-entry ${entry.level}">
          <span class="log-time">${entry.time}</span>
          <span class="log-type">${entry.level.toUpperCase()}</span>
          <span class="log-message">${this.escapeHtml(entry.message)}</span>
        </div>
      `)
            .join("");
        this.container.innerHTML = html;
        this.container.scrollTop = this.container.scrollHeight;
    }
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}
//# sourceMappingURL=logger.js.map