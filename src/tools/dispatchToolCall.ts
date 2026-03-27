import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions/completions";
import type { ToolRegistry } from "./registry.js";
import type { ToolExecutionResult } from "./types.js";

function parseToolArguments(rawArguments: string): unknown {
  try {
    return JSON.parse(rawArguments);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Invalid JSON arguments.";

    throw new Error(`Failed to parse tool arguments: ${reason}`);
  }
}

export async function dispatchToolCall(
  registry: ToolRegistry,
  toolCall: ChatCompletionMessageToolCall,
): Promise<ToolExecutionResult> {
  if (toolCall.type !== "function") {
    return {
      success: false,
      toolName: "unknown_tool",
      content: "",
      error: `Unsupported tool call type: ${toolCall.type}`,
    };
  }

  const toolName = toolCall.function.name;
  const tool = registry.getTool(toolName);

  if (!tool) {
    return {
      success: false,
      toolName,
      content: "",
      error: `Tool not found: ${toolName}`,
    };
  }

  try {
    const parsedArguments = parseToolArguments(toolCall.function.arguments);

    return await tool.execute(parsedArguments, {
      traceId: toolCall.id,
    });
  } catch (error) {
    return {
      success: false,
      toolName,
      content: "",
      error:
        error instanceof Error
          ? error.message
          : "Unknown tool dispatch error.",
    };
  }
}

export async function dispatchToolCalls(
  registry: ToolRegistry,
  toolCalls: ChatCompletionMessageToolCall[],
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];

  for (const toolCall of toolCalls) {
    results.push(await dispatchToolCall(registry, toolCall));
  }

  return results;
}
