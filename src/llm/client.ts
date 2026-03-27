import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { assertModelConfig, type ResolvedModelConfig } from "./modelConfig.js";

export type ChatMessage = ChatCompletionMessageParam;
export type ToolDefinition = ChatCompletionTool;

export interface CallModelOptions {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  temperature?: number;
}

export type ChatCompletionResponse =
  OpenAI.Chat.Completions.ChatCompletion;

function createOpenAiClient(config: ResolvedModelConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
}

function buildChatCompletionRequest(
  config: ResolvedModelConfig,
  options: CallModelOptions,
): ChatCompletionCreateParamsNonStreaming {
  return {
    model: config.model,
    messages: options.messages,
    tools: options.tools,
    tool_choice: options.toolChoice,
    temperature: options.temperature,
  };
}

async function requestChatCompletion(
  client: OpenAI,
  config: ResolvedModelConfig,
  options: CallModelOptions,
): Promise<ChatCompletionResponse> {
  try {
    return await client.chat.completions.create(
      buildChatCompletionRequest(config, options),
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`LLM request failed: ${error.message}`);
    }

    throw new Error("LLM request failed with an unknown error.");
  }
}

export async function callModel(
  options: CallModelOptions,
): Promise<ChatCompletionResponse> {
  const config = assertModelConfig();
  const client = createOpenAiClient(config);

  return requestChatCompletion(client, config, options);
}

export function createLlmClient(config: ResolvedModelConfig = assertModelConfig()) {
  const client = createOpenAiClient(config);

  return {
    callModel: (options: CallModelOptions): Promise<ChatCompletionResponse> =>
      requestChatCompletion(client, config, options),
  };
}
