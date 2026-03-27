import type { ToolDefinition as LlmToolDefinition } from "./client.js";
import type { ToolDefinition as LocalToolDefinition } from "../tools/types.js";

export function toLlmToolSchema(
  tool: LocalToolDefinition,
): LlmToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

export function toLlmToolSchemas(
  tools: LocalToolDefinition[],
): LlmToolDefinition[] {
  return tools.map(toLlmToolSchema);
}
