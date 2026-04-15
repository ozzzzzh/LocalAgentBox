/**
 * 文件浏览器组件
 */
import { Logger } from "./logger";
export class FileExplorer {
    constructor(container, client) {
        this.currentPath = "";
        this.onFileSelect = null;
        this.container = container;
        this.client = client;
        this.logger = Logger.getInstance();
    }
    setOnFileSelect(handler) {
        this.onFileSelect = handler;
    }
    async refresh(path = ".") {
        try {
            this.logger.info(`加载目录: ${path}`);
            const result = (await this.client.callTool("file.list", {
                path,
                recursive: false,
            }));
            if (!result.success) {
                this.logger.error(`加载失败: ${result.error}`);
                return;
            }
            this.render(result.items || []);
        }
        catch (error) {
            this.logger.error("加载文件列表失败", error);
        }
    }
    async search(pattern) {
        try {
            this.logger.info(`搜索: ${pattern}`);
            const result = (await this.client.callTool("file.search", {
                pattern,
                path: ".",
            }));
            if (!result.success) {
                this.logger.error(`搜索失败: ${result.error}`);
                return;
            }
            this.renderSearchResults(result.results || []);
        }
        catch (error) {
            this.logger.error("搜索失败", error);
        }
    }
    render(items) {
        if (items.length === 0) {
            this.container.innerHTML = '<div class="empty-state">目录为空</div>';
            return;
        }
        // 排序：目录在前，然后按名称排序
        const sorted = [...items].sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "directory" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        const html = sorted
            .map((item) => {
            const ext = item.name.split(".").pop() || "";
            const icon = this.getFileIcon(item.type, ext);
            const size = item.size ? this.formatSize(item.size) : "";
            return `
          <div class="file-item ${item.type}" data-path="${item.path}" data-type="${item.type}">
            <span class="icon">${icon}</span>
            <span class="name">${this.escapeHtml(item.name)}</span>
            ${size ? `<span class="size">${size}</span>` : ""}
          </div>
        `;
        })
            .join("");
        this.container.innerHTML = html;
        // 绑定点击事件
        this.container.querySelectorAll(".file-item").forEach((el) => {
            el.addEventListener("click", (e) => {
                const target = e.currentTarget;
                const path = target.dataset.path || "";
                const type = target.dataset.type;
                // 移除其他选中
                this.container.querySelectorAll(".file-item").forEach((el) => {
                    el.classList.remove("selected");
                });
                // 选中当前
                target.classList.add("selected");
                if (type === "directory") {
                    this.refresh(path);
                }
                else if (this.onFileSelect) {
                    this.onFileSelect(path);
                }
            });
            // 双击打开
            el.addEventListener("dblclick", (e) => {
                const target = e.currentTarget;
                const path = target.dataset.path || "";
                const type = target.dataset.type;
                if (type === "file" && this.onFileSelect) {
                    this.onFileSelect(path);
                }
            });
        });
    }
    renderSearchResults(items) {
        if (items.length === 0) {
            this.container.innerHTML = '<div class="empty-state">未找到匹配文件</div>';
            return;
        }
        const html = items
            .map((item) => {
            const icon = this.getFileIcon(item.type, item.name.split(".").pop() || "");
            return `
          <div class="file-item ${item.type}" data-path="${item.path}" data-type="${item.type}">
            <span class="icon">${icon}</span>
            <span class="name">${this.escapeHtml(item.name)}</span>
          </div>
        `;
        })
            .join("");
        this.container.innerHTML = html;
    }
    getFileIcon(type, ext) {
        if (type === "directory") {
            return "📁";
        }
        const icons = {
            py: "🐍",
            js: "📜",
            ts: "📘",
            json: "📋",
            md: "📝",
            txt: "📄",
            html: "🌐",
            css: "🎨",
            go: "🐹",
            rs: "🦀",
            java: "☕",
            cpp: "⚡",
            c: "⚡",
        };
        return icons[ext.toLowerCase()] || "📄";
    }
    formatSize(bytes) {
        if (bytes < 1024)
            return `${bytes}B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)}KB`;
        if (bytes < 1024 * 1024 * 1024)
            return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
    }
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}
//# sourceMappingURL=fileExplorer.js.map