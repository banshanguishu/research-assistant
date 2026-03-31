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

export function summarizeToolUsage(
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
