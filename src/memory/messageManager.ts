import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions/completions";
import type { ChatMessage } from "../llm/client.js";

export type MessageList = ChatMessage[];

export function createInitialMessages(
  topic: string,
  systemPrompt: string,
): MessageList {
  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: topic,
    },
  ];
}

export function appendAssistantMessage(
  messages: MessageList,
  content: string | null,
  toolCalls?: ChatCompletionMessageToolCall[],
): MessageList {
  return [
    ...messages,
    {
      role: "assistant",
      content,
      tool_calls: toolCalls,
    },
  ];
}

export function appendToolMessage(
  messages: MessageList,
  toolCallId: string,
  content: string,
): MessageList {
  return [
    ...messages,
    {
      role: "tool",
      tool_call_id: toolCallId,
      content,
    },
  ];
}

export function appendUserMessage(
  messages: MessageList,
  content: string,
): MessageList {
  return [
    ...messages,
    {
      role: "user",
      content,
    },
  ];
}
