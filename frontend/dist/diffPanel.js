/**
 * Diff Panel - 显示文件修改差异
 */
import { Logger } from "./logger.js";
export class DiffPanel {
    constructor() {
        this.modal = null;
        this.logger = Logger.getInstance();
    }
    /**
     * 显示 diff 面板
     */
    show(filePath, oldContent, newContent) {
        // 移除已存在的面板
        this.hide();
        const diffLines = this.computeDiff(oldContent, newContent);
        const stats = this.computeStats(diffLines);
        // 创建模态框
        this.modal = document.createElement("div");
        this.modal.className = "diff-modal";
        this.modal.innerHTML = `
      <div class="diff-backdrop"></div>
      <div class="diff-container">
        <div class="diff-header">
          <div class="diff-title">
            <span class="diff-icon">📝</span>
            <span>文件修改: ${this.escapeHtml(filePath.split("/").pop() || filePath)}</span>
          </div>
          <div class="diff-stats">
            <span class="stat-add">+${stats.adds}</span>
            <span class="stat-remove">-${stats.removes}</span>
          </div>
          <div class="diff-actions">
            <button class="btn btn-small btn-apply" title="应用修改">✓ 接受</button>
            <button class="btn btn-small btn-secondary btn-close" title="关闭">✕</button>
          </div>
        </div>
        <div class="diff-filename">${this.escapeHtml(filePath)}</div>
        <div class="diff-content">
          <div class="diff-line-numbers old">${this.renderLineNumbers(diffLines, "old")}</div>
          <div class="diff-body">${this.renderDiffContent(diffLines)}</div>
          <div class="diff-line-numbers new">${this.renderLineNumbers(diffLines, "new")}</div>
        </div>
      </div>
    `;
        document.body.appendChild(this.modal);
        // 绑定事件
        this.modal.querySelector(".btn-close")?.addEventListener("click", () => this.hide());
        this.modal.querySelector(".diff-backdrop")?.addEventListener("click", () => this.hide());
        this.modal.querySelector(".btn-apply")?.addEventListener("click", () => {
            this.hide();
            this.logger.success("修改已应用");
        });
        this.logger.info(`显示文件修改: ${filePath}`);
    }
    /**
     * 隐藏 diff 面板
     */
    hide() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }
    /**
     * 计算简单的行级 diff
     */
    computeDiff(oldContent, newContent) {
        const oldLines = oldContent.split("\n");
        const newLines = newContent.split("\n");
        const result = [];
        // 使用简单的 LCS 算法
        const lcs = this.longestCommonSubsequence(oldLines, newLines);
        let oldIdx = 0;
        let newIdx = 0;
        let lcsIdx = 0;
        while (oldIdx < oldLines.length || newIdx < newLines.length) {
            if (lcsIdx < lcs.length) {
                // 处理删除的行
                while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcs[lcsIdx]) {
                    result.push({
                        type: "remove",
                        content: oldLines[oldIdx],
                        oldLine: oldIdx + 1,
                    });
                    oldIdx++;
                }
                // 处理新增的行
                while (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
                    result.push({
                        type: "add",
                        content: newLines[newIdx],
                        newLine: newIdx + 1,
                    });
                    newIdx++;
                }
                // 处理相同的行
                if (oldIdx < oldLines.length && newIdx < newLines.length) {
                    result.push({
                        type: "context",
                        content: oldLines[oldIdx],
                        oldLine: oldIdx + 1,
                        newLine: newIdx + 1,
                    });
                    oldIdx++;
                    newIdx++;
                    lcsIdx++;
                }
            }
            else {
                // 剩余的删除行
                while (oldIdx < oldLines.length) {
                    result.push({
                        type: "remove",
                        content: oldLines[oldIdx],
                        oldLine: oldIdx + 1,
                    });
                    oldIdx++;
                }
                // 剩余的新增行
                while (newIdx < newLines.length) {
                    result.push({
                        type: "add",
                        content: newLines[newIdx],
                        newLine: newIdx + 1,
                    });
                    newIdx++;
                }
            }
        }
        return result;
    }
    /**
     * 最长公共子序列 (LCS)
     */
    longestCommonSubsequence(a, b) {
        const m = a.length;
        const n = b.length;
        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                }
                else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        // 回溯找出 LCS
        const lcs = [];
        let i = m, j = n;
        while (i > 0 && j > 0) {
            if (a[i - 1] === b[j - 1]) {
                lcs.unshift(a[i - 1]);
                i--;
                j--;
            }
            else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            }
            else {
                j--;
            }
        }
        return lcs;
    }
    /**
     * 计算 diff 统计
     */
    computeStats(lines) {
        return {
            adds: lines.filter((l) => l.type === "add").length,
            removes: lines.filter((l) => l.type === "remove").length,
        };
    }
    /**
     * 渲染行号
     */
    renderLineNumbers(lines, side) {
        return lines
            .map((line) => {
            const num = side === "old" ? line.oldLine : line.newLine;
            return `<div class="diff-num">${num || ""}</div>`;
        })
            .join("");
    }
    /**
     * 渲染 diff 内容
     */
    renderDiffContent(lines) {
        return lines
            .map((line) => {
            const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
            const cls = line.type === "add" ? "line-add" : line.type === "remove" ? "line-remove" : "line-context";
            return `<div class="${cls}"><span class="diff-prefix">${prefix}</span>${this.escapeHtml(line.content)}</div>`;
        })
            .join("");
    }
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}
//# sourceMappingURL=diffPanel.js.map