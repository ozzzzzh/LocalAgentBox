/**
 * Toast 提示组件
 */

export class Toast {
  private static container: HTMLElement;

  static init(container: HTMLElement): void {
    this.container = container;
  }

  static show(message: string, type: "success" | "error" | "warning" = "success", duration: number = 3000): void {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideIn 0.3s ease reverse";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  static success(message: string): void {
    this.show(message, "success");
  }

  static error(message: string): void {
    this.show(message, "error", 5000);
  }

  static warning(message: string): void {
    this.show(message, "warning", 4000);
  }
}
