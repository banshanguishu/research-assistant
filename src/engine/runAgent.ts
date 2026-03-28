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

export interface RunAgentOptions {
  topic: string;
  maxIterations?: number;
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

function getAssistantContent(content: string | null): string {
  return content ?? "";
}

export async function runAgent(
  options: RunAgentOptions,
): Promise<RunAgentResult> {
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

    const response = await llmClient.callModel({
      messages,
      tools,
      toolChoice: "auto",
      temperature: 0.2,
    });

    const choice = response.choices[0];

    if (!choice) {
      throw new Error("LLM returned no choices.");
    }

    const assistantMessage = choice.message;
    messages = appendAssistantMessage(
      messages,
      assistantMessage.content,
      assistantMessage.tool_calls,
    );

    const toolCalls = assistantMessage.tool_calls ?? [];

    if (toolCalls.length === 0) {
      finalAnswer = getAssistantContent(assistantMessage.content);
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

      messages = appendToolMessage(
        messages,
        toolCall.id,
        formatToolResult(toolResult),
      );
    }
  }

  if (!finalAnswer) {
    finalAnswer =
      "Agent stopped before producing a final answer. Review the collected messages and tool results.";
  }

  return {
    topic: options.topic,
    finalAnswer,
    messages,
    iterations,
    toolResults,
  };
}
