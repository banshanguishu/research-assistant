export interface ToolExecutionContext {
  traceId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  content: string;
  error?: string;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    input: TInput,
    context?: ToolExecutionContext,
  ) => Promise<ToolExecutionResult>;
}

export type RegisteredToolDefinition = ToolDefinition<any>;
