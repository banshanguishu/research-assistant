import type { ToolUsageSummary } from "../engine/toolUsageSummary.js";

export const REFLECTION_PASS = "PASS";
export const REFLECTION_FAIL = "FAIL";

export function buildReflectionPrompt(toolUsage: ToolUsageSummary): string {
  const toolSummaryLines = Object.entries(toolUsage.byTool).map(
    ([toolName, stat]) =>
      `- ${toolName}: 共 ${stat.total} 次，成功 ${stat.successful} 次，失败 ${stat.failed} 次`,
  );

  return [
    "请先进行一次自检。",
    "以下是程序统计到的工具使用情况，你可以把它当作客观事实参考：",
    `- 工具总调用次数: ${toolUsage.totalCalls}`,
    `- 工具成功次数: ${toolUsage.successfulCalls}`,
    `- 工具失败次数: ${toolUsage.failedCalls}`,
    ...(toolSummaryLines.length > 0 ? toolSummaryLines : ["- 暂无工具调用记录"]),
    "请结合以上统计信息，以及你已经看到的全部 tool observation，自主判断当前证据是否足够支撑正式研究结论。",
    `如果你判断证据已经足够，请严格按以下格式回复：`,
    `REFLECTION_STATUS: ${REFLECTION_PASS}`,
    "FINAL_ANSWER:",
    "<在这里给出最终回答，需明确证据边界和不确定性>",
    `如果你判断证据还不足，请优先直接调用合适的工具继续收集信息。`,
    `如果你暂时不调用工具，也必须严格按以下格式回复：`,
    `REFLECTION_STATUS: ${REFLECTION_FAIL}`,
    "REASON: <反思未通过的原因>",
    "NEXT_ACTION: <下一步计划补充什么信息，或准备调用什么工具>",
    "不要只重复自检过程本身，必须明确给出 PASS 或 FAIL。",
  ].join("\n");
}

export function buildRetryAfterFailedReflectionPrompt(
  reason: string,
  nextAction: string,
): string {
  return [
    "你刚才的反思结论是 FAIL，请继续推进研究。",
    `当前缺口: ${reason || "未明确说明"}`,
    `建议动作: ${nextAction || "请根据现有 observation 自主决定下一步工具调用"}`,
    "请不要直接输出最终结论，优先调用合适工具补充信息。",
  ].join("\n");
}
