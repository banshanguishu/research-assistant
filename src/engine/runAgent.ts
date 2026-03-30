import { createLlmClient } from "../llm/client.js";
import { toLlmToolSchemas } from "../llm/toolSchema.js";
import {
  appendAssistantMessage,
  appendToolMessage,
  createInitialMessages,
  type MessageList,
} from "../memory/messageManager.js";
import { buildSystemPrompt } from "../prompts/systemPrompt.js";
import { dispatchToolCalls } from "../tools/dispatchToolCall.js";
import { createDefaultToolRegistry } from "../tools/registry.js";
import type { ToolExecutionResult } from "../tools/types.js";
import { createLogger } from "../utils/logger.js";

export interface RunAgentOptions {
  topic: string;
  maxIterations?: number;
  verbose?: boolean;
}

export interface RunAgentResult {
  topic: string;
  finalAnswer: string;
  messages: MessageList;
  iterations: number;
  toolResults: ToolExecutionResult[];
}

const DEFAULT_MAX_ITERATIONS = 6;

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
  const logger = createLogger(options.verbose ?? true);
  const llmClient = createLlmClient();
  const registry = createDefaultToolRegistry();
  const tools = toLlmToolSchemas(registry.getAllTools());
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  let messages = createInitialMessages(options.topic, buildSystemPrompt());
  const toolResults: ToolExecutionResult[] = [];
  let iterations = 0;
  let finalAnswer = "";

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
