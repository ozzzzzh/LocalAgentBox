/**
 * 布局管理器 - 处理拖拽调整大小和抽屉菜单
 */
export class LayoutManager {
    constructor() {
        this.drawerOpen = false;
        this.activeDrawerTab = "tools";
        this.leftSidebar = document.getElementById("leftSidebar");
        this.rightSidebar = document.getElementById("rightSidebar");
        this.drawer = document.getElementById("drawer");
        this.drawerHandle = document.getElementById("drawerHandle");
        this.drawerContent = this.drawer.querySelector(".drawer-content");
        this.initResizeHandles();
        this.initDrawer();
    }
    /**
     * 初始化拖拽调整大小
     */
    initResizeHandles() {
        const handles = document.querySelectorAll(".resize-handle");
        handles.forEach((handle) => {
            const resizeType = handle.getAttribute("data-resize");
            handle.addEventListener("mousedown", (e) => {
                e.preventDefault();
                handle.classList.add("active");
                const startX = e.clientX;
                const startLeftWidth = this.leftSidebar.offsetWidth;
                const startRightWidth = this.rightSidebar.offsetWidth;
                const onMouseMove = (moveEvent) => {
                    const deltaX = moveEvent.clientX - startX;
                    if (resizeType === "left") {
                        const newWidth = Math.max(150, Math.min(400, startLeftWidth + deltaX));
                        this.leftSidebar.style.width = `${newWidth}px`;
                    }
                    else if (resizeType === "right") {
                        const newWidth = Math.max(200, Math.min(500, startRightWidth - deltaX));
                        this.rightSidebar.style.width = `${newWidth}px`;
                    }
                };
                const onMouseUp = () => {
                    handle.classList.remove("active");
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                };
                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            });
        });
    }
    /**
     * 初始化抽屉
     */
    initDrawer() {
        // 点击手柄切换抽屉
        this.drawerHandle.addEventListener("click", () => {
            this.toggleDrawer();
        });
        // 关闭按钮
        const closeBtn = document.getElementById("closeDrawerBtn");
        closeBtn?.addEventListener("click", () => {
            this.closeDrawer();
        });
        // 工具按钮
        const toolsBtn = document.getElementById("toggleToolsBtn");
        toolsBtn?.addEventListener("click", () => {
            this.openDrawer("tools");
        });
        // 日志按钮
        const logsBtn = document.getElementById("toggleLogsBtn");
        logsBtn?.addEventListener("click", () => {
            this.openDrawer("logs");
        });
        // 抽屉标签切换
        const drawerTabs = document.querySelectorAll(".drawer-tab");
        drawerTabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                const tabName = tab.getAttribute("data-tab");
                if (tabName) {
                    this.switchDrawerTab(tabName);
                }
            });
        });
        // 抽屉拖拽调整高度
        this.initDrawerResize();
    }
    /**
     * 抽屉高度拖拽
     */
    initDrawerResize() {
        const handle = this.drawerHandle;
        let startY = 0;
        let startHeight = 0;
        handle.addEventListener("mousedown", (e) => {
            if (!this.drawerOpen)
                return;
            e.preventDefault();
            startY = e.clientY;
            startHeight = this.drawerContent.offsetHeight;
            const onMouseMove = (moveEvent) => {
                const deltaY = startY - moveEvent.clientY;
                const newHeight = Math.max(100, Math.min(400, startHeight + deltaY));
                this.drawerContent.style.maxHeight = `${newHeight}px`;
            };
            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }
    /**
     * 切换抽屉
     */
    toggleDrawer() {
        if (this.drawerOpen) {
            this.closeDrawer();
        }
        else {
            this.openDrawer();
        }
    }
    /**
     * 打开抽屉
     */
    openDrawer(tab) {
        this.drawerOpen = true;
        this.drawer.classList.add("open");
        if (tab) {
            this.switchDrawerTab(tab);
        }
        // 更新工具栏按钮状态
        this.updateToolbarButtons();
    }
    /**
     * 关闭抽屉
     */
    closeDrawer() {
        this.drawerOpen = false;
        this.drawer.classList.remove("open");
        this.updateToolbarButtons();
    }
    /**
     * 切换抽屉标签
     */
    switchDrawerTab(tab) {
        this.activeDrawerTab = tab;
        // 更新标签状态
        const tabs = document.querySelectorAll(".drawer-tab");
        tabs.forEach((t) => {
            if (t.getAttribute("data-tab") === tab) {
                t.classList.add("active");
            }
            else {
                t.classList.remove("active");
            }
        });
        // 更新面板显示
        const panels = document.querySelectorAll(".drawer-panel");
        panels.forEach((p) => {
            p.classList.remove("active");
        });
        const activePanel = document.getElementById(`${tab}Drawer`);
        activePanel?.classList.add("active");
        this.updateToolbarButtons();
    }
    /**
     * 更新工具栏按钮状态
     */
    updateToolbarButtons() {
        const toolsBtn = document.getElementById("toggleToolsBtn");
        const logsBtn = document.getElementById("toggleLogsBtn");
        toolsBtn?.classList.toggle("active", this.drawerOpen && this.activeDrawerTab === "tools");
        logsBtn?.classList.toggle("active", this.drawerOpen && this.activeDrawerTab === "logs");
    }
}
//# sourceMappingURL=layoutManager.js.map