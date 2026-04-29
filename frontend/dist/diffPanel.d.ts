/**
 * Diff Panel - 显示文件修改差异
 */
export declare class DiffPanel {
    private logger;
    private modal;
    constructor();
    /**
     * 显示 diff 面板
     */
    show(filePath: string, oldContent: string, newContent: string): void;
    /**
     * 隐藏 diff 面板
     */
    hide(): void;
    /**
     * 计算简单的行级 diff
     */
    private computeDiff;
    /**
     * 最长公共子序列 (LCS)
     */
    private longestCommonSubsequence;
    /**
     * 计算 diff 统计
     */
    private computeStats;
    /**
     * 渲染行号
     */
    private renderLineNumbers;
    /**
     * 渲染 diff 内容
     */
    private renderDiffContent;
    private escapeHtml;
}
