import type { ToolDefinition } from "./types.js";

export interface ToolRegistry {
  register: (tool: ToolDefinition) => void;
  getTool: (name: string) => ToolDefinition | undefined;
  getAllTools: () => ToolDefinition[];
}

export function createToolRegistry(
  initialTools: ToolDefinition[] = [],
): ToolRegistry {
  const toolMap = new Map<string, ToolDefinition>();

  for (const tool of initialTools) {
    toolMap.set(tool.name, tool);
  }

  return {
    register: (tool: ToolDefinition): void => {
      toolMap.set(tool.name, tool);
    },
    getTool: (name: string): ToolDefinition | undefined => toolMap.get(name),
    getAllTools: (): ToolDefinition[] => Array.from(toolMap.values()),
  };
}
