import { createLlmClient } from "../llm/client.js";
import { toLlmToolSchemas } from "../llm/toolSchema.js";
import {
  appendAssistantMessage,
  appendToolMessage,
  appendUserMessage,
  createInitialMessages,
  type MessageList,
} from "../memory/messageManager.js";
import {
  buildReflectionPrompt,
  buildRetryAfterFailedReflectionPrompt,
  REFLECTION_FAIL,
  REFLECTION_PASS,
} from "../prompts/reflectionPrompt.js";
import {
  createResearchPlan,
  formatResearchPlanForContext,
} from "./planner.js";
import { buildSystemPrompt } from "../prompts/systemPrompt.js";
import { parseReflectionResult } from "./reflection.js";
import { summarizeToolUsage } from "./toolUsageSummary.js";
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

const DEFAULT_MAX_ITERATIONS = 10;
const MAX_REFLECTION_ROUNDS = 3;

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
  let awaitingReflectionDecision = false;

  logger.step(`开始运行研究任务，主题: ${options.topic}`);
  logger.step("进入 planning 阶段，准备提取研究维度和关键词。");

  const researchPlan = await createResearchPlan(llmClient, options.topic);
  const planningContext = formatResearchPlanForContext(researchPlan);

  logger.info(
    `planning 完成，共提取 ${researchPlan.dimensions.length} 个研究维度。`,
  );

  for (const [index, dimension] of researchPlan.dimensions.entries()) {
    logger.info(
      `规划维度 ${index + 1} -> ${dimension.name} | 关键词: ${dimension.keywords.join(
        "、",
      )}`,
    );
  }

  messages = appendUserMessage(messages, planningContext);
  logger.step("planning 结果已写入上下文，进入正式研究循环。");

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
      if (awaitingReflectionDecision) {
        logger.step(`第 ${iterations} 轮反思未通过，模型决定继续调用工具补充信息。`);
        awaitingReflectionDecision = false;
      }

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
      if (awaitingReflectionDecision) {
        const reflectionResult = parseReflectionResult(assistantContent);

        if (reflectionResult.status === REFLECTION_PASS) {
          finalAnswer = reflectionResult.finalAnswer || assistantContent;
          logger.step(`第 ${iterations} 轮反思通过，模型确认可以结束。`);
          if (reflectionResult.finalAnswer) {
            logger.info(
              `最终回答摘要: ${summarizeText(reflectionResult.finalAnswer)}`,
            );
          }
          break;
        }

        if (reflectionResult.status === REFLECTION_FAIL) {
          logger.step(`第 ${iterations} 轮反思未通过，模型判断仍需补充信息。`);
          logger.info(
            `反思原因: ${summarizeText(reflectionResult.reason || "未明确说明")}`,
          );
          logger.info(
            `下一步计划: ${summarizeText(
              reflectionResult.nextAction || "未明确说明",
            )}`,
          );
          awaitingReflectionDecision = false;
          messages = appendUserMessage(
            messages,
            buildRetryAfterFailedReflectionPrompt(
              reflectionResult.reason,
              reflectionResult.nextAction,
            ),
          );
          continue;
        }

        if (reflectionRoundsUsed >= MAX_REFLECTION_ROUNDS) {
          logger.warn("反思结果未按约定格式返回，且已达到最大反思轮次，结束当前任务。");
          finalAnswer = assistantContent;
          break;
        }

        reflectionRoundsUsed += 1;
        logger.warn("反思结果未按约定格式返回，要求模型重新给出 PASS 或 FAIL。");
        messages = appendUserMessage(
          messages,
          [
            "你的上一条反思结果未按要求返回。",
            `请严格使用以下格式之一：REFLECTION_STATUS: ${REFLECTION_PASS} 或 REFLECTION_STATUS: ${REFLECTION_FAIL}。`,
            "如果 PASS，请补充 FINAL_ANSWER；如果 FAIL，请补充 REASON 和 NEXT_ACTION。",
          ].join("\n"),
        );
        continue;
      }

      if (reflectionRoundsUsed >= MAX_REFLECTION_ROUNDS) {
        finalAnswer = assistantContent;
        logger.warn("已达到最大反思轮次，使用当前回答作为最终输出。");
        break;
      }

      const toolUsage = summarizeToolUsage(toolResults);
      const reflectionPrompt = buildReflectionPrompt(toolUsage);
      reflectionRoundsUsed += 1;
      awaitingReflectionDecision = true;
      logger.step(`第 ${iterations} 轮未调用工具，进入反思阶段。`);
      logger.info(
        `工具统计: 总 ${toolUsage.totalCalls} 次 | 成功 ${toolUsage.successfulCalls} 次 | 失败 ${toolUsage.failedCalls} 次`,
      );
      logger.info(`反思提示: ${summarizeText(reflectionPrompt)}`);
      messages = appendUserMessage(messages, reflectionPrompt);
      continue;
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
