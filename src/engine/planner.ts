import type { LlmClient } from "../llm/client.js";
import {
  buildPlanningPrompt,
  RESEARCH_PLANNING_SYSTEM_PROMPT,
} from "../prompts/planningPrompt.js";

export interface ResearchDimension {
  name: string;
  keywords: string[];
}

export interface ResearchPlan {
  dimensions: ResearchDimension[];
}

function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractJsonObject(content: string): string {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = content.indexOf("{");
  const lastBraceIndex = content.lastIndexOf("}");

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    throw new Error("Planning result does not contain a JSON object.");
  }

  return content.slice(firstBraceIndex, lastBraceIndex + 1);
}

function parseResearchPlan(content: string): ResearchPlan {
  const jsonText = extractJsonObject(content);
  const parsedValue = JSON.parse(jsonText) as Partial<ResearchPlan>;
  const dimensions = Array.isArray(parsedValue.dimensions)
    ? parsedValue.dimensions
    : [];

  const normalizedDimensions = dimensions
    .map((dimension) => {
      const name =
        typeof dimension?.name === "string" ? normalizeKeyword(dimension.name) : "";
      const keywords = Array.isArray(dimension?.keywords)
        ? dimension.keywords
            .filter((keyword): keyword is string => typeof keyword === "string")
            .map((keyword) => normalizeKeyword(keyword))
            .filter(Boolean)
            .slice(0, 3)
        : [];

      return {
        name,
        keywords,
      };
    })
    .filter((dimension) => dimension.name && dimension.keywords.length > 0)
    .slice(0, 3);

  if (normalizedDimensions.length < 2) {
    throw new Error("Planning result must contain at least 2 valid dimensions.");
  }

  return {
    dimensions: normalizedDimensions,
  };
}

export function formatResearchPlanForContext(plan: ResearchPlan): string {
  return [
    "以下是当前研究任务的初步规划，请在后续搜索、资料提取和总结时优先参考这些维度与关键词，并可根据 observation 动态调整：",
    ...plan.dimensions.map((dimension, index) => {
      const keywordLine = dimension.keywords.join("、");

      return `${index + 1}. ${dimension.name}\n关键词：${keywordLine}`;
    }),
  ].join("\n");
}

export async function createResearchPlan(
  llmClient: LlmClient,
  topic: string,
): Promise<ResearchPlan> {
  const response = await llmClient.callModel({
    messages: [
      {
        role: "system",
        content: RESEARCH_PLANNING_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildPlanningPrompt(topic),
      },
    ],
    toolChoice: "none",
    temperature: 0.2,
  });
  const content = response.choices[0]?.message?.content ?? "";

  if (!content) {
    throw new Error("Planning step returned empty content.");
  }

  return parseResearchPlan(content);
}
