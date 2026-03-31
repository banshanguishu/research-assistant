import type { ToolExecutionResult } from "../tools/types.js";

export interface ToolUsageStat {
  total: number;
  successful: number;
  failed: number;
}

export interface ToolUsageSummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  byTool: Record<string, ToolUsageStat>;
}

export interface ReflectionDecision {
  shouldReflect: boolean;
  reasons: string[];
  toolUsage: ToolUsageSummary;
}

function buildToolUsageSummary(
  toolResults: ToolExecutionResult[],
): ToolUsageSummary {
  const byTool: Record<string, ToolUsageStat> = {};
  let successfulCalls = 0;
  let failedCalls = 0;

  for (const toolResult of toolResults) {
    const currentStat = byTool[toolResult.toolName] ?? {
      total: 0,
      successful: 0,
      failed: 0,
    };

    currentStat.total += 1;

    if (toolResult.success) {
      currentStat.successful += 1;
      successfulCalls += 1;
    } else {
      currentStat.failed += 1;
      failedCalls += 1;
    }

    byTool[toolResult.toolName] = currentStat;
  }

  return {
    totalCalls: toolResults.length,
    successfulCalls,
    failedCalls,
    byTool,
  };
}

export function evaluateReflectionNeed(
  toolResults: ToolExecutionResult[],
  assistantContent: string,
): ReflectionDecision {
  const toolUsage = buildToolUsageSummary(toolResults);
  const reasons: string[] = [];

  if (toolUsage.totalCalls > 0) {
    reasons.push("当前已经积累了工具 observation，请先基于这些事实进行一次自检。");
  }

  if (toolUsage.failedCalls > 0) {
    reasons.push("之前存在失败的工具调用，请评估这些缺口是否影响正式研究结论。");
  }

  if (toolUsage.totalCalls > 0 && assistantContent.trim().length < 120) {
    reasons.push("当前回答较短，请确认是否已经覆盖足够证据后再结束。");
  }

  if (toolUsage.totalCalls > 0 && assistantContent.trim().length === 0) {
    reasons.push("模型当前没有给出可见的结论文本。");
  }

  return {
    shouldReflect: toolUsage.totalCalls > 0 && reasons.length > 0,
    reasons,
    toolUsage,
  };
}
