import { fetchPageContentTool } from "./fetchPageContent.js";
import { searchWebTool } from "./searchWeb.js";
import type { RegisteredToolDefinition } from "./types.js";

export interface ToolRegistry {
  register: (tool: RegisteredToolDefinition) => void;
  getTool: (name: string) => RegisteredToolDefinition | undefined;
  getAllTools: () => RegisteredToolDefinition[];
}

export function createToolRegistry(
  initialTools: RegisteredToolDefinition[] = [],
): ToolRegistry {
  const toolMap = new Map<string, RegisteredToolDefinition>();

  for (const tool of initialTools) {
    toolMap.set(tool.name, tool);
  }

  return {
    register: (tool: RegisteredToolDefinition): void => {
      toolMap.set(tool.name, tool);
    },
    getTool: (name: string): RegisteredToolDefinition | undefined =>
      toolMap.get(name),
    getAllTools: (): RegisteredToolDefinition[] => Array.from(toolMap.values()),
  };
}

export function createDefaultToolRegistry(): ToolRegistry {
  return createToolRegistry([searchWebTool, fetchPageContentTool]);
}
