/**
 * 工具面板组件
 */
import { Logger } from "./logger";
export class ToolsPanel {
    constructor(container, client) {
        this.container = container;
        this.client = client;
        this.logger = Logger.getInstance();
    }
    render() {
        const tools = this.client.getTools();
        if (tools.length === 0) {
            this.container.innerHTML = '<div class="empty-state">无可用工具</div>';
            return;
        }
        // 按类别分组
        const grouped = this.groupTools(tools);
        const html = Object.entries(grouped)
            .map(([category, categoryTools]) => {
            const itemsHtml = categoryTools
                .map((tool) => `
            <div class="tool-item" data-tool="${tool.name}">
              <span class="tool-icon">${this.getToolIcon(tool.name)}</span>
              <div class="tool-info">
                <div class="tool-name">${tool.name}</div>
                <div class="tool-desc">${tool.description}</div>
              </div>
            </div>
          `)
                .join("");
            return `
          <div class="tool-category">
            <div class="tool-category-header">${category}</div>
            ${itemsHtml}
          </div>
        `;
        })
            .join("");
        this.container.innerHTML = html;
        // 绑定点击事件
        this.container.querySelectorAll(".tool-item").forEach((el) => {
            el.addEventListener("click", () => {
                const toolName = el.getAttribute("data-tool");
                if (toolName) {
                    this.showToolDialog(toolName);
                }
            });
        });
    }
    groupTools(tools) {
        const groups = {};
        tools.forEach((tool) => {
            const category = this.getCategory(tool.name);
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(tool);
        });
        return groups;
    }
    getCategory(toolName) {
        const prefix = toolName.split(".")[0];
        const categoryMap = {
            file: "📁 文件操作",
            code: "💻 代码工具",
            editor: "✏️ 编辑器",
            workspace: "📂 工作区",
            shell: "🖥️ Shell",
            custom: "🔧 自定义",
        };
        return categoryMap[prefix] || "📦 其他";
    }
    getToolIcon(toolName) {
        if (toolName.startsWith("file.read"))
            return "📖";
        if (toolName.startsWith("file.write"))
            return "✏️";
        if (toolName.startsWith("file.list"))
            return "📋";
        if (toolName.startsWith("file.delete"))
            return "🗑️";
        if (toolName.startsWith("file.search"))
            return "🔍";
        if (toolName.startsWith("code"))
            return "💻";
        if (toolName.startsWith("editor"))
            return "📝";
        return "🔧";
    }
    showToolDialog(toolName) {
        const tools = this.client.getTools();
        const tool = tools.find((t) => t.name === toolName);
        if (!tool)
            return;
        // 创建简单的工具调用对话框
        const dialog = document.createElement("div");
        dialog.className = "tool-dialog";
        dialog.innerHTML = `
      <div class="tool-dialog-content">
        <div class="tool-dialog-header">
          <h4>${tool.name}</h4>
          <button class="dialog-close">&times;</button>
        </div>
        <div class="tool-dialog-body">
          <p>${tool.description}</p>
          <div class="tool-params" id="toolParams">
            ${this.renderParams(tool)}
          </div>
        </div>
        <div class="tool-dialog-footer">
          <button class="btn btn-secondary dialog-cancel">取消</button>
          <button class="btn btn-primary tool-execute">执行</button>
        </div>
      </div>
    `;
        // 样式
        dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;
        const content = dialog.querySelector(".tool-dialog-content");
        content.style.cssText = `
      background: var(--bg-secondary);
      border-radius: 8px;
      min-width: 400px;
      max-width: 600px;
      max-height: 80vh;
      overflow: auto;
    `;
        const header = dialog.querySelector(".tool-dialog-header");
        header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    `;
        const body = dialog.querySelector(".tool-dialog-body");
        body.style.cssText = `
      padding: 16px;
    `;
        const footer = dialog.querySelector(".tool-dialog-footer");
        footer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid var(--border-color);
    `;
        document.body.appendChild(dialog);
        // 绑定事件
        dialog.querySelector(".dialog-close")?.addEventListener("click", () => {
            dialog.remove();
        });
        dialog.querySelector(".dialog-cancel")?.addEventListener("click", () => {
            dialog.remove();
        });
        dialog.querySelector(".tool-execute")?.addEventListener("click", async () => {
            await this.executeTool(tool, dialog);
        });
        // 点击背景关闭
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
    }
    renderParams(tool) {
        const props = tool.parameters.properties || {};
        const required = tool.parameters.required || [];
        return Object.entries(props)
            .map(([name, schema]) => {
            const inputType = this.getInputType(schema.type);
            const isRequired = required.includes(name);
            return `
          <div class="form-group">
            <label>${name} ${isRequired ? '<span style="color: var(--error-color)">*</span>' : ''}</label>
            <input type="${inputType}" name="${name}"
                   placeholder="${schema.description || ""}"
                   ${isRequired ? "required" : ""}>
          </div>
        `;
        })
            .join("");
    }
    getInputType(schemaType) {
        const typeMap = {
            string: "text",
            integer: "number",
            number: "number",
            boolean: "checkbox",
        };
        return typeMap[schemaType || "string"] || "text";
    }
    async executeTool(tool, dialog) {
        const params = {};
        const inputs = dialog.querySelectorAll(".tool-params input");
        inputs.forEach((input) => {
            const name = input.name;
            let value = input.value;
            if (input.type === "checkbox") {
                value = input.checked;
            }
            else if (input.type === "number") {
                value = parseFloat(value) || 0;
            }
            params[name] = value;
        });
        try {
            this.logger.info(`执行工具: ${tool.name}`);
            const result = await this.client.callTool(tool.name, params);
            this.logger.success(`执行成功`, result);
            // 显示结果
            const resultDiv = document.createElement("div");
            resultDiv.style.cssText = `
        margin-top: 16px;
        padding: 12px;
        background: var(--bg-tertiary);
        border-radius: 4px;
        font-family: var(--font-mono);
        font-size: 12px;
        max-height: 200px;
        overflow: auto;
        white-space: pre-wrap;
      `;
            resultDiv.textContent = JSON.stringify(result, null, 2);
            const body = dialog.querySelector(".tool-dialog-body");
            body?.appendChild(resultDiv);
        }
        catch (error) {
            this.logger.error(`执行失败: ${error}`);
        }
    }
}
//# sourceMappingURL=toolsPanel.js.map