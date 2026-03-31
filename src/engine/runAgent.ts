import { createLlmClient } from "../llm/client.js";
import { toLlmToolSchemas } from "../llm/toolSchema.js";
import {
  appendAssistantMessage,
  appendToolMessage,
  appendUserMessage,
  createInitialMessages,
  type MessageList,
} from "../memory/messageManager.js";
import { buildSystemPrompt } from "../prompts/systemPrompt.js";
import {
  evaluateReflectionNeed,
  type ToolUsageSummary,
} from "./stopConditions.js";
import { dispatchToolCalls } from "../tools/dispatchToolCall.js";
import { createDefaultToolRegistry } from "../tools/registry.js";
import type { ToolExecutionResult } from "../tools/types.js";
import { createLogger } from "../utils/logger.js";

export interface RunAgentOptions {
  topic: string;
  maxIterations?: number;
  verbose?: boolean;
  logFilePath?: string | null;
}

export interface RunAgentResult {
  topic: string;
  finalAnswer: string;
  messages: MessageList;
  iterations: number;
  toolResults: ToolExecutionResult[];
}

const DEFAULT_MAX_ITERATIONS = 6;
const MAX_REFLECTION_ROUNDS = 2;

function formatToolResult(result: ToolExecutionResult): string {
  return JSON.stringify(result, null, 2);
}

function summarizeText(value: string, maxLength = 160): string {
  const normalizedValue = value.replace(/\s+/g, " ").trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength)}...`;
}

function getAssistantContent(content: string | null): string {
  return content ?? "";
}

function buildReflectionPrompt(
  reasons: string[],
  toolUsage: ToolUsageSummary,
): string {
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
    "以下是需要你重点检查的点：",
    ...reasons.map((reason, index) => `${index + 1}. ${reason}`),
    "请结合以上统计信息，以及你已经看到的全部 tool observation，自主判断当前证据是否足够支撑正式研究结论。",
    "如果证据不足，请继续调用合适的工具；如果证据已经足够，请明确说明证据边界和不确定性，然后给出最终回答。",
    "不要只重复自检过程本身，而要明确做出下一步决策。",
  ].join("\n");
}

export async function runAgent(
  options: RunAgentOptions,
): Promise<RunAgentResult> {
  const logger = createLogger({
    enabled: options.verbose ?? true,
    filePath: options.logFilePath,
  });
  const llmClient = createLlmClient();
  const registry = createDefaultToolRegistry();
  const tools = toLlmToolSchemas(registry.getAllTools());
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  let messages = createInitialMessages(options.topic, buildSystemPrompt());
  const toolResults: ToolExecutionResult[] = [];
  let iterations = 0;
  let finalAnswer = "";
  let reflectionRoundsUsed = 0;

  logger.step(`开始运行研究任务，主题: ${options.topic}`);

  while (iterations < maxIterations) {
    iterations += 1;
    logger.step(`第 ${iterations} 轮开始，准备请求模型。`);

    const response = await llmClient.callModel({
      messages,
      tools,
      toolChoice: "auto",
      temperature: 0.2,
    });
    logger.info(`第 ${iterations} 轮模型响应已返回。`);

    const choice = response.choices[0];

    if (!choice) {
      logger.error("模型未返回任何 choices。");
      throw new Error("LLM returned no choices.");
    }

    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.tool_calls ?? [];
    const assistantContent = getAssistantContent(assistantMessage.content);

    messages = appendAssistantMessage(
      messages,
      assistantMessage.content,
      toolCalls,
    );

    if (toolCalls.length > 0) {
      logger.info(`第 ${iterations} 轮模型决定调用 ${toolCalls.length} 个工具。`);

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
          logger.warn(`收到暂不支持的工具调用类型：${toolCall.type}`);
          continue;
        }

        logger.info(
          `工具调用 -> ${toolCall.function.name} | 参数摘要: ${summarizeText(
            toolCall.function.arguments,
          )}`,
        );
      }
    } else if (assistantContent) {
      logger.info(
        `第 ${iterations} 轮模型未调用工具，回复摘要: ${summarizeText(
          assistantContent,
        )}`,
      );
    } else {
      logger.warn(`第 ${iterations} 轮模型未调用工具，且未返回可见文本内容。`);
    }

    if (toolCalls.length === 0) {
      const reflectionDecision = evaluateReflectionNeed(
        toolResults,
        assistantContent,
      );
      const shouldReflect =
        reflectionRoundsUsed < MAX_REFLECTION_ROUNDS &&
        reflectionDecision.shouldReflect;

      if (shouldReflect) {
        reflectionRoundsUsed += 1;
        const reflectionPrompt = buildReflectionPrompt(
          reflectionDecision.reasons,
          reflectionDecision.toolUsage,
        );
        logger.step(`第 ${iterations} 轮触发自检，要求模型确认信息是否充分。`);
        logger.info(
          `触发原因: ${reflectionDecision.reasons
            .map((reason) => summarizeText(reason, 80))
            .join(" | ")}`,
        );
        logger.info(
          `工具统计: 总 ${reflectionDecision.toolUsage.totalCalls} 次 | 成功 ${reflectionDecision.toolUsage.successfulCalls} 次 | 失败 ${reflectionDecision.toolUsage.failedCalls} 次`,
        );
        logger.info(`自检提示: ${summarizeText(reflectionPrompt)}`);
        messages = appendUserMessage(messages, reflectionPrompt);
        continue;
      }

      finalAnswer = assistantContent;
      logger.step(`第 ${iterations} 轮结束，模型已给出最终回答。`);
      break;
    }

    const currentResults = await dispatchToolCalls(registry, toolCalls);
    toolResults.push(...currentResults);

    for (let index = 0; index < toolCalls.length; index += 1) {
      const toolCall = toolCalls[index];
      const toolResult = currentResults[index];

      if (!toolResult) {
        continue;
      }

      if (toolResult.success) {
        logger.info(
          `工具结果 <- ${toolResult.toolName} 成功 | 内容摘要: ${summarizeText(
            toolResult.content,
          )}`,
        );
      } else {
        logger.warn(
          `工具结果 <- ${toolResult.toolName} 失败 | 错误: ${
            toolResult.error ?? "未知错误"
          }`,
        );
      }

      messages = appendToolMessage(
        messages,
        toolCall.id,
        formatToolResult(toolResult),
      );
    }

    logger.step(`第 ${iterations} 轮结束，已写回工具 observation，准备进入下一轮。`);
  }

  if (!finalAnswer) {
    logger.warn("达到最大轮次或未收敛，使用兜底提示作为最终输出。");
    finalAnswer =
      "Agent stopped before producing a final answer. Review the collected messages and tool results.";
  }

  logger.step(`运行结束，共执行 ${iterations} 轮。`);

  return {
    topic: options.topic,
    finalAnswer,
    messages,
    iterations,
    toolResults,
  };
}
