/**
 * 主入口文件
 */

import { AgentClient } from "./client.js";
import { Logger } from "./logger.js";
import { FileExplorer } from "./fileExplorer.js";
import { CodeEditor } from "./codeEditor.js";
import { ToolsPanel } from "./toolsPanel.js";
import { Toast } from "./toast.js";
import { ConnectionOptions } from "./types.js";

class App {
  private client: AgentClient | null = null;
  private fileExplorer: FileExplorer | null = null;
  private codeEditor: CodeEditor | null = null;
  private toolsPanel: ToolsPanel | null = null;
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
    this.init();
  }

  private init(): void {
    // 初始化日志
    const logsContainer = document.getElementById("logsContainer");
    if (logsContainer) {
      this.logger.setContainer(logsContainer);
    }

    // 初始化 Toast
    const toastContainer = document.getElementById("toastContainer");
    if (toastContainer) {
      Toast.init(toastContainer);
    }

    // 绑定事件
    this.bindEvents();

    // 加载保存的设置
    this.loadSettings();

    this.logger.info("应用已初始化");
  }

  private bindEvents(): void {
    // 连接表单
    const connectionForm = document.getElementById("connectionForm");
    connectionForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleConnect();
    });

    // 刷新文件
    const refreshFilesBtn = document.getElementById("refreshFilesBtn");
    refreshFilesBtn?.addEventListener("click", () => {
      if (this.fileExplorer) {
        this.fileExplorer.refresh(".");
      }
    });

    // 保存文件
    const saveFileBtn = document.getElementById("saveFileBtn");
    saveFileBtn?.addEventListener("click", () => {
      if (this.codeEditor) {
        this.codeEditor.save();
      }
    });

    // 清空日志
    const clearLogsBtn = document.getElementById("clearLogsBtn");
    clearLogsBtn?.addEventListener("click", () => {
      this.logger.clear();
    });

    // 侧边栏标签切换
    const sidebarTabs = document.querySelectorAll(".sidebar-tab");
    sidebarTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.getAttribute("data-tab");

        // 切换标签激活状态
        sidebarTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        // 切换内容
        document.querySelectorAll(".tab-content").forEach((content) => {
          content.classList.remove("active");
        });
        document.getElementById(`${tabName}Tab`)?.classList.add("active");
      });
    });

    // 设置弹窗
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const closeSettingsBtn = document.getElementById("closeSettingsBtn");

    settingsBtn?.addEventListener("click", () => {
      settingsModal?.classList.remove("hidden");
    });

    closeSettingsBtn?.addEventListener("click", () => {
      settingsModal?.classList.add("hidden");
    });

    // 设置变更
    const settingTheme = document.getElementById("settingTheme") as HTMLSelectElement;
    const settingFontSize = document.getElementById("settingFontSize") as HTMLInputElement;

    settingTheme?.addEventListener("change", () => {
      this.applyTheme(settingTheme.value);
      this.saveSettings();
    });

    settingFontSize?.addEventListener("change", () => {
      this.applyFontSize(settingFontSize.value);
      this.saveSettings();
    });
  }

  private async handleConnect(): Promise<void> {
    const gatewayUrl = (document.getElementById("gatewayUrl") as HTMLInputElement)?.value;
    const workspace = (document.getElementById("workspace") as HTMLInputElement)?.value;
    const apiKey = (document.getElementById("apiKey") as HTMLInputElement)?.value;
    const useTls = (document.getElementById("useTls") as HTMLInputElement)?.checked;

    const options: ConnectionOptions = {
      gatewayUrl,
      workspace,
      apiKey: apiKey || undefined,
      useTls,
      autoReconnect: true,
    };

    // 创建客户端
    this.client = new AgentClient(options);

    // 监听连接状态
    this.client.onConnectionChange((connected) => {
      this.updateConnectionStatus(connected);

      if (connected) {
        // 连接成功后加载工具目录和节点列表
        this.postConnect();

        // 显示编辑器面板
        document.getElementById("connectionPanel")?.classList.add("hidden");
        document.getElementById("editorPanel")?.classList.remove("hidden");
      } else {
        // 显示连接面板
        document.getElementById("connectionPanel")?.classList.remove("hidden");
        document.getElementById("editorPanel")?.classList.add("hidden");
      }
    });

    try {
      await this.client.connect();

      // 更新状态栏
      const workspacePath = document.getElementById("workspacePath");
      if (workspacePath) {
        workspacePath.textContent = `工作区: ${workspace || "未设置"}`;
      }

      const connectionInfo = document.getElementById("connectionInfo");
      if (connectionInfo) {
        connectionInfo.textContent = gatewayUrl;
      }

      Toast.success("连接成功");
    } catch (error) {
      Toast.error("连接失败");
      this.logger.error("连接失败", error);
    }
  }

  /**
   * 连接成功后：加载工具、节点，初始化 UI 组件
   */
  private async postConnect(): Promise<void> {
    if (!this.client) return;

    // 并行获取工具目录和节点列表
    await Promise.all([
      this.client.fetchToolsCatalog(),
      this.client.fetchNodes(),
    ]);

    this.initComponents();
  }

  private initComponents(): void {
    if (!this.client) return;

    // 文件浏览器
    const fileTree = document.getElementById("fileTree");
    if (fileTree) {
      this.fileExplorer = new FileExplorer(fileTree, this.client);
      this.fileExplorer.refresh(".");

      // 文件选择回调
      this.fileExplorer.setOnFileSelect((path) => {
        if (this.codeEditor) {
          this.codeEditor.openFile(path);
        }
      });
    }

    // 代码编辑器
    const editor = document.getElementById("codeEditor") as HTMLTextAreaElement;
    const lineNumbers = document.getElementById("lineNumbers");
    const editorTabs = document.getElementById("editorTabs");
    const cursorPosition = document.getElementById("cursorPosition");
    const fileInfo = document.getElementById("fileInfo");

    if (editor && lineNumbers && editorTabs && cursorPosition && fileInfo) {
      this.codeEditor = new CodeEditor(
        editor,
        lineNumbers,
        editorTabs,
        cursorPosition,
        fileInfo,
        this.client
      );
    }

    // 工具面板
    const toolsList = document.getElementById("toolsList");
    if (toolsList) {
      this.toolsPanel = new ToolsPanel(toolsList, this.client);
      this.toolsPanel.render();
    }

    // 更新工具计数
    const toolCount = document.getElementById("toolCount");
    if (toolCount && this.client) {
      toolCount.textContent = `工具: ${this.client.getTools().length}`;
    }
  }

  private updateConnectionStatus(connected: boolean): void {
    const statusDot = document.querySelector(".status-dot");
    const statusText = document.querySelector(".status-text");

    if (statusDot) {
      statusDot.classList.remove("connected", "connecting", "disconnected");
      statusDot.classList.add(connected ? "connected" : "disconnected");
    }

    if (statusText) {
      statusText.textContent = connected ? "已连接" : "未连接";
    }
  }

  private applyTheme(theme: string): void {
    if (theme === "light") {
      document.documentElement.style.setProperty("--bg-primary", "#ffffff");
      document.documentElement.style.setProperty("--bg-secondary", "#f3f3f3");
      document.documentElement.style.setProperty("--bg-tertiary", "#e8e8e8");
      document.documentElement.style.setProperty("--text-primary", "#333333");
      document.documentElement.style.setProperty("--text-secondary", "#666666");
      document.documentElement.style.setProperty("--border-color", "#e0e0e0");
    } else {
      document.documentElement.style.setProperty("--bg-primary", "#1e1e1e");
      document.documentElement.style.setProperty("--bg-secondary", "#252526");
      document.documentElement.style.setProperty("--bg-tertiary", "#2d2d2d");
      document.documentElement.style.setProperty("--text-primary", "#cccccc");
      document.documentElement.style.setProperty("--text-secondary", "#858585");
      document.documentElement.style.setProperty("--border-color", "#3c3c3c");
    }
  }

  private applyFontSize(size: string): void {
    const editor = document.getElementById("codeEditor") as HTMLTextAreaElement;
    const lineNumbers = document.getElementById("lineNumbers");

    if (editor) {
      editor.style.fontSize = `${size}px`;
    }
    if (lineNumbers) {
      lineNumbers.style.fontSize = `${size}px`;
    }
  }

  private saveSettings(): void {
    const theme = (document.getElementById("settingTheme") as HTMLSelectElement)?.value;
    const fontSize = (document.getElementById("settingFontSize") as HTMLInputElement)?.value;

    localStorage.setItem("agent-gateway-settings", JSON.stringify({ theme, fontSize }));
  }

  private loadSettings(): void {
    const saved = localStorage.getItem("agent-gateway-settings");
    if (!saved) return;

    try {
      const settings = JSON.parse(saved);

      const settingTheme = document.getElementById("settingTheme") as HTMLSelectElement;
      const settingFontSize = document.getElementById("settingFontSize") as HTMLInputElement;

      if (settingTheme && settings.theme) {
        settingTheme.value = settings.theme;
        this.applyTheme(settings.theme);
      }

      if (settingFontSize && settings.fontSize) {
        settingFontSize.value = settings.fontSize;
        this.applyFontSize(settings.fontSize);
      }
    } catch (e) {
      // 忽略解析错误
    }
  }
}

// 启动应用
document.addEventListener("DOMContentLoaded", () => {
  new App();
});
