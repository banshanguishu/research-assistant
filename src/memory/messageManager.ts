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
  content: string,
): MessageList {
  return [
    ...messages,
    {
      role: "assistant",
      content,
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
