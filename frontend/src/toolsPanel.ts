/**
 * 工具面板组件
 */

import { AgentClient } from "./client.js";
import { ToolDefinition, SkillInfo } from "./types.js";
import { Logger } from "./logger.js";

export class ToolsPanel {
  private container: HTMLElement;
  private client: AgentClient;
  private logger: Logger;
  private nodeId: string | null = null;

  constructor(container: HTMLElement, client: AgentClient) {
    this.container = container;
    this.client = client;
    this.logger = Logger.getInstance();
    this.findNode();
  }

  private async findNode(): Promise<void> {
    const nodes = this.client.getNodes();
    if (nodes.length > 0) {
      const fileNode = nodes.find((n) =>
        (n.commands || []).some((cmd) => cmd.startsWith("file.") || cmd.startsWith("code."))
      );
      this.nodeId = fileNode?.nodeId || nodes[0].nodeId;
    }
  }

  render(): void {
    const tools = this.client.getTools();
    const skills = this.client.getSkills();

    if (tools.length === 0 && skills.length === 0) {
      this.container.innerHTML = '<div class="empty-state">无可用工具和技能</div>';
      return;
    }

    // 渲染技能和工具
    let html = "";

    if (skills.length > 0) {
      html += this.renderSkillsSection(skills);
    }

    if (tools.length > 0) {
      html += this.renderToolsSection(tools);
    }

    this.container.innerHTML = html;

    // 绑定点击事件
    this.bindEvents();
  }

  private renderSkillsSection(skills: SkillInfo[]): string {
    // 按来源分组
    const bundled = skills.filter((s) => s.bundled);
    const workspace = skills.filter((s) => !s.bundled);
    const eligible = skills.filter((s) => s.eligible);
    const blocked = skills.filter((s) => s.blockedByAllowlist);

    return `
      <div class="skills-section">
        <div class="section-header">
          <span>🎯 Skills (${eligible.length}/${skills.length} 可用)</span>
        </div>
        <div class="skills-summary">
          <span class="skill-badge bundled">内置: ${bundled.length}</span>
          <span class="skill-badge workspace">工作区: ${workspace.length}</span>
          ${blocked.length > 0 ? `<span class="skill-badge blocked">受限: ${blocked.length}</span>` : ""}
        </div>
        <div class="skills-list">
          ${skills.map((skill) => this.renderSkillItem(skill)).join("")}
        </div>
      </div>
    `;
  }

  private renderSkillItem(skill: SkillInfo): string {
    const statusClass = skill.eligible ? "eligible" : skill.blockedByAllowlist ? "blocked" : "missing";
    const statusIcon = skill.eligible ? "✅" : skill.blockedByAllowlist ? "🚫" : "⚠️";
    const emoji = skill.emoji || "📦";

    return `
      <div class="skill-item ${statusClass}" data-skill="${skill.skillKey}">
        <span class="skill-emoji">${emoji}</span>
        <div class="skill-info">
          <div class="skill-name">${skill.name}</div>
          <div class="skill-desc">${skill.description}</div>
          <div class="skill-meta">
            <span class="skill-source">${skill.bundled ? "内置" : skill.source}</span>
            ${skill.missing.length > 0 ? `<span class="skill-missing">缺少: ${skill.missing.join(", ")}</span>` : ""}
          </div>
        </div>
        <span class="skill-status">${statusIcon}</span>
      </div>
    `;
  }

  private renderToolsSection(tools: ToolDefinition[]): string {
    // 按类别分组
    const grouped = this.groupTools(tools);

    const html = Object.entries(grouped)
      .map(([category, categoryTools]) => {
        const itemsHtml = categoryTools
          .map(
            (tool) => `
            <div class="tool-item" data-tool="${tool.name}">
              <span class="tool-icon">${this.getToolIcon(tool.name)}</span>
              <div class="tool-info">
                <div class="tool-name">${tool.name}</div>
                <div class="tool-desc">${tool.description}</div>
              </div>
            </div>
          `
          )
          .join("");

        return `
          <div class="tool-category">
            <div class="tool-category-header">${category}</div>
            ${itemsHtml}
          </div>
        `;
      })
      .join("");

    return `<div class="tools-section">${html}</div>`;
  }

  private bindEvents(): void {
    // 工具点击事件
    this.container.querySelectorAll(".tool-item").forEach((el) => {
      el.addEventListener("click", () => {
        const toolName = el.getAttribute("data-tool");
        if (toolName) {
          this.showToolDialog(toolName);
        }
      });
    });

    // 技能点击事件（可展开详情）
    this.container.querySelectorAll(".skill-item").forEach((el) => {
      el.addEventListener("click", () => {
        const skillKey = el.getAttribute("data-skill");
        if (skillKey) {
          this.toggleSkillDetail(el as HTMLElement, skillKey);
        }
      });
    });
  }

  private toggleSkillDetail(el: HTMLElement, skillKey: string): void {
    // 切换展开状态
    const isExpanded = el.classList.contains("expanded");

    // 关闭其他展开的技能
    this.container.querySelectorAll(".skill-item.expanded").forEach((item) => {
      item.classList.remove("expanded");
      const detail = item.querySelector(".skill-detail");
      if (detail) detail.remove();
    });

    if (!isExpanded) {
      el.classList.add("expanded");
      const skills = this.client.getSkills();
      const skill = skills.find((s) => s.skillKey === skillKey);
      if (skill) {
        const detailHtml = `
          <div class="skill-detail">
            <div class="detail-row"><span>来源:</span><span>${skill.source}</span></div>
            <div class="detail-row"><span>路径:</span><span>${skill.filePath}</span></div>
            ${skill.primaryEnv ? `<div class="detail-row"><span>环境变量:</span><span>${skill.primaryEnv}</span></div>` : ""}
            ${skill.homepage ? `<div class="detail-row"><span>主页:</span><a href="${skill.homepage}" target="_blank">${skill.homepage}</a></div>` : ""}
            ${skill.requirements.length > 0 ? `<div class="detail-row"><span>要求:</span><span>${skill.requirements.join(", ")}</span></div>` : ""}
          </div>
        `;
        el.insertAdjacentHTML("beforeend", detailHtml);
      }
    }
  }

  private groupTools(tools: ToolDefinition[]): Record<string, ToolDefinition[]> {
    const groups: Record<string, ToolDefinition[]> = {};

    tools.forEach((tool) => {
      const category = this.getCategory(tool.name);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(tool);
    });

    return groups;
  }

  private getCategory(toolName: string): string {
    const prefix = toolName.split(".")[0];
    const categoryMap: Record<string, string> = {
      file: "📁 文件操作",
      code: "💻 代码工具",
      editor: "✏️ 编辑器",
      workspace: "📂 工作区",
      shell: "🖥️ Shell",
      custom: "🔧 自定义",
    };

    return categoryMap[prefix] || "📦 其他";
  }

  private getToolIcon(toolName: string): string {
    if (toolName.startsWith("file.read")) return "📖";
    if (toolName.startsWith("file.write")) return "✏️";
    if (toolName.startsWith("file.list")) return "📋";
    if (toolName.startsWith("file.delete")) return "🗑️";
    if (toolName.startsWith("file.search")) return "🔍";
    if (toolName.startsWith("code")) return "💻";
    if (toolName.startsWith("editor")) return "📝";
    return "🔧";
  }

  private showToolDialog(toolName: string): void {
    const tools = this.client.getTools();
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) return;

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

    const content = dialog.querySelector(".tool-dialog-content") as HTMLElement;
    content.style.cssText = `
      background: var(--bg-secondary);
      border-radius: 8px;
      min-width: 400px;
      max-width: 600px;
      max-height: 80vh;
      overflow: auto;
    `;

    const header = dialog.querySelector(".tool-dialog-header") as HTMLElement;
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    `;

    const body = dialog.querySelector(".tool-dialog-body") as HTMLElement;
    body.style.cssText = `
      padding: 16px;
    `;

    const footer = dialog.querySelector(".tool-dialog-footer") as HTMLElement;
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

  private renderParams(tool: ToolDefinition): string {
    const props = tool.parameters.properties || {};
    const required = tool.parameters.required || [];

    return Object.entries(props)
      .map(([name, schema]) => {
        const schemaObj = schema as { type?: string; description?: string };
        const inputType = this.getInputType(schemaObj.type);
        const isRequired = required.includes(name);

        return `
          <div class="form-group">
            <label>${name} ${isRequired ? '<span style="color: var(--error-color)">*</span>' : ""}</label>
            <input type="${inputType}" name="${name}"
                   placeholder="${schemaObj.description || ""}"
                   ${isRequired ? "required" : ""}>
          </div>
        `;
      })
      .join("");
  }

  private getInputType(schemaType?: string): string {
    const typeMap: Record<string, string> = {
      string: "text",
      integer: "number",
      number: "number",
      boolean: "checkbox",
    };
    return typeMap[schemaType || "string"] || "text";
  }

  private async executeTool(tool: ToolDefinition, dialog: HTMLElement): Promise<void> {
    if (!this.nodeId) {
      await this.findNode();
    }

    if (!this.nodeId) {
      this.logger.error("没有可用的节点");
      return;
    }

    const params: Record<string, unknown> = {};
    const inputs = dialog.querySelectorAll<HTMLInputElement>(".tool-params input");

    inputs.forEach((input) => {
      const name = input.name;
      let value: string | boolean | number = input.value;

      if (input.type === "checkbox") {
        value = input.checked;
      } else if (input.type === "number") {
        value = parseFloat(value) || 0;
      }

      params[name] = value;
    });

    try {
      this.logger.info(`执行工具: ${tool.name}`);
      const result = await this.client.invokeNodeCommand(this.nodeId, tool.name, params);

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
    } catch (error) {
      this.logger.error(`执行失败: ${error}`);
    }
  }
}
