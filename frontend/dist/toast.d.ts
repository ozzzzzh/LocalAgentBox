/**
 * Toast 提示组件
 */
export declare class Toast {
    private static container;
    static init(container: HTMLElement): void;
    static show(message: string, type?: "success" | "error" | "warning", duration?: number): void;
    static success(message: string): void;
    static error(message: string): void;
    static warning(message: string): void;
}
