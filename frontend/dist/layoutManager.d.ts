/**
 * 布局管理器 - 处理拖拽调整大小和抽屉菜单
 */
export declare class LayoutManager {
    private leftSidebar;
    private rightSidebar;
    private drawer;
    private drawerHandle;
    private drawerContent;
    private drawerOpen;
    private activeDrawerTab;
    constructor();
    /**
     * 初始化拖拽调整大小
     */
    private initResizeHandles;
    /**
     * 初始化抽屉
     */
    private initDrawer;
    /**
     * 抽屉高度拖拽
     */
    private initDrawerResize;
    /**
     * 切换抽屉
     */
    toggleDrawer(): void;
    /**
     * 打开抽屉
     */
    openDrawer(tab?: string): void;
    /**
     * 关闭抽屉
     */
    closeDrawer(): void;
    /**
     * 切换抽屉标签
     */
    switchDrawerTab(tab: string): void;
    /**
     * 更新工具栏按钮状态
     */
    private updateToolbarButtons;
}
