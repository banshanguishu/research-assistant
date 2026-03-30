import type { ToolExecutionResult } from "../tools/types.js";

export interface ReflectionDecision {
  shouldReflect: boolean;
  reasons: string[];
  successfulSearchCount: number;
  successfulFetchCount: number;
  failedToolCount: number;
}

function countSuccessfulToolResults(
  toolResults: ToolExecutionResult[],
  toolName: string,
): number {
  return toolResults.filter(
    (toolResult) => toolResult.success && toolResult.toolName === toolName,
  ).length;
}

function countFailedToolResults(toolResults: ToolExecutionResult[]): number {
  return toolResults.filter((toolResult) => !toolResult.success).length;
}

export function evaluateReflectionNeed(
  toolResults: ToolExecutionResult[],
  assistantContent: string,
): ReflectionDecision {
  const successfulSearchCount = countSuccessfulToolResults(
    toolResults,
    "search_web",
  );
  const successfulFetchCount = countSuccessfulToolResults(
    toolResults,
    "fetch_page_content",
  );
  const failedToolCount = countFailedToolResults(toolResults);
  const reasons: string[] = [];

  if (successfulSearchCount > 0 && successfulFetchCount === 0) {
    reasons.push("已经完成搜索，但尚未读取任何关键正文页面。");
  }

  if (failedToolCount > 0) {
    reasons.push("本轮之前存在失败的工具调用，信息链可能不完整。");
  }

  if (toolResults.length > 0 && assistantContent.trim().length < 120) {
    reasons.push("当前总结过短，可能不足以支撑正式研究结论。");
  }

  if (toolResults.length > 0 && assistantContent.trim().length === 0) {
    reasons.push("模型当前没有给出可见的结论文本。");
  }

  return {
    shouldReflect: reasons.length > 0,
    reasons,
    successfulSearchCount,
    successfulFetchCount,
    failedToolCount,
  };
}
