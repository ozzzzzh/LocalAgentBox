/**
 * Toast 提示组件
 */
export class Toast {
    static init(container) {
        this.container = container;
    }
    static show(message, type = "success", duration = 3000) {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = "slideIn 0.3s ease reverse";
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    static success(message) {
        this.show(message, "success");
    }
    static error(message) {
        this.show(message, "error", 5000);
    }
    static warning(message) {
        this.show(message, "warning", 4000);
    }
}
//# sourceMappingURL=toast.js.map