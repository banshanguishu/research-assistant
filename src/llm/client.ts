import { assertModelConfig, type ResolvedModelConfig } from "./modelConfig.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface CallModelOptions {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: string | null;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function buildChatCompletionsUrl(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, "")}/chat/completions`;
}

async function parseErrorResponse(response: Response): Promise<string> {
  const fallbackMessage = `LLM request failed with status ${response.status}.`;

  try {
    const text = await response.text();
    return text.trim().length > 0 ? text : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function postChatCompletion(
  config: ResolvedModelConfig,
  options: CallModelOptions,
): Promise<ChatCompletionResponse> {
  const response = await fetch(buildChatCompletionsUrl(config.baseURL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: options.messages,
      tools: options.tools,
      tool_choice: options.toolChoice,
      temperature: options.temperature,
    }),
  });

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  return (await response.json()) as ChatCompletionResponse;
}

export async function callModel(
  options: CallModelOptions,
): Promise<ChatCompletionResponse> {
  const config = assertModelConfig();
  return postChatCompletion(config, options);
}

export function createLlmClient(config: ResolvedModelConfig = assertModelConfig()) {
  return {
    callModel: (options: CallModelOptions): Promise<ChatCompletionResponse> =>
      postChatCompletion(config, options),
  };
}
