import { tavily } from "@tavily/core";
import type { ToolDefinition, ToolExecutionResult } from "./types.js";

export type SearchProviderName = "mock" | "tavily";

export interface SearchWebInput {
  query: string;
  maxResults?: number;
  topic?: "general" | "news" | "finance";
}

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

interface SearchProviderConfig {
  provider: SearchProviderName;
  apiKey: string | null;
  baseURL: string | null;
}

interface SearchProvider {
  search: (input: SearchWebInput, config: SearchProviderConfig) => Promise<SearchResultItem[]>;
}

const SEARCH_WEB_TOOL_NAME = "search_web";
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_TAVILY_BASE_URL = "https://api.tavily.com";

function readEnv(name: string): string | null {
  const value = process.env[name];

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function loadSearchProviderConfig(): SearchProviderConfig {
  const providerValue = readEnv("SEARCH_PROVIDER");

  if (providerValue === "mock" || providerValue === "tavily") {
    return {
      provider: providerValue,
      apiKey: readEnv("SEARCH_API_KEY"),
      baseURL: readEnv("SEARCH_BASE_URL"),
    };
  }

  return {
    provider: "mock",
    apiKey: readEnv("SEARCH_API_KEY"),
    baseURL: readEnv("SEARCH_BASE_URL"),
  };
}

function normalizeSearchInput(input: SearchWebInput): SearchWebInput {
  return {
    query: input.query.trim(),
    maxResults: input.maxResults ?? DEFAULT_MAX_RESULTS,
    topic: input.topic ?? "general",
  };
}

function validateSearchInput(input: SearchWebInput): string | null {
  if (typeof input.query !== "string" || input.query.trim().length === 0) {
    return "The search query must be a non-empty string.";
  }

  if (
    input.maxResults !== undefined &&
    (!Number.isInteger(input.maxResults) || input.maxResults <= 0)
  ) {
    return "maxResults must be a positive integer.";
  }

  return null;
}

function formatSearchResults(
  provider: SearchProviderName,
  input: SearchWebInput,
  results: SearchResultItem[],
): string {
  return JSON.stringify(
    {
      provider,
      query: input.query,
      maxResults: input.maxResults,
      topic: input.topic,
      results,
    },
    null,
    2,
  );
}

function getSearchBaseUrl(config: SearchProviderConfig): string {
  if (config.baseURL) {
    return config.baseURL;
  }

  if (config.provider === "tavily") {
    return DEFAULT_TAVILY_BASE_URL;
  }

  return "";
}

const mockSearchProvider: SearchProvider = {
  async search(input: SearchWebInput): Promise<SearchResultItem[]> {
    const query = input.query;

    return [
      {
        title: `${query}：行业概览示例结果`,
        url: "https://example.com/overview",
        snippet: "用于本地开发的 mock 搜索结果，帮助先打通工具调用链路。",
      },
      {
        title: `${query}：政策与市场示例结果`,
        url: "https://example.com/policy-market",
        snippet: "后续接入真实 Tavily SDK 搜索后，这里会被真实搜索结果替换。",
      },
      {
        title: `${query}：案例与挑战示例结果`,
        url: "https://example.com/cases-risks",
        snippet: "当前结果仅用于验证 Agent 的 Planning -> Tool Use -> Observation 闭环。",
      },
    ].slice(0, input.maxResults ?? DEFAULT_MAX_RESULTS);
  },
};

const tavilySearchProvider: SearchProvider = {
  async search(
    input: SearchWebInput,
    config: SearchProviderConfig,
  ): Promise<SearchResultItem[]> {
    if (!config.apiKey) {
      throw new Error("SEARCH_API_KEY is required when SEARCH_PROVIDER=tavily.");
    }

    const client = tavily({
      apiKey: config.apiKey,
      apiBaseURL: getSearchBaseUrl(config),
    });

    const response = await client.search(input.query, {
      topic: input.topic,
      maxResults: input.maxResults,
      searchDepth: "basic",
    });

    return response.results.map((item) => ({
      title: item.title ?? "Untitled result",
      url: item.url ?? "",
      snippet: item.content ?? "",
    }));
  },
};

function getSearchProvider(config: SearchProviderConfig): SearchProvider {
  if (config.provider === "tavily") {
    return tavilySearchProvider;
  }

  return mockSearchProvider;
}

function buildSuccessResult(
  config: SearchProviderConfig,
  input: SearchWebInput,
  results: SearchResultItem[],
): ToolExecutionResult {
  return {
    success: true,
    toolName: SEARCH_WEB_TOOL_NAME,
    content: formatSearchResults(config.provider, input, results),
  };
}

function buildErrorResult(error: unknown): ToolExecutionResult {
  const message =
    error instanceof Error ? error.message : "Unknown search tool error.";

  return {
    success: false,
    toolName: SEARCH_WEB_TOOL_NAME,
    content: "",
    error: message,
  };
}

export const searchWebTool: ToolDefinition<SearchWebInput> = {
  name: SEARCH_WEB_TOOL_NAME,
  description:
    "Search the web for recent or general information and return titles, URLs, and snippets.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to execute.",
      },
      maxResults: {
        type: "integer",
        description: "Maximum number of results to return.",
      },
      topic: {
        type: "string",
        enum: ["general", "news", "finance"],
        description: "High-level topic used by providers that support topic routing.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(input: SearchWebInput): Promise<ToolExecutionResult> {
    const validationError = validateSearchInput(input);

    if (validationError) {
      return {
        success: false,
        toolName: SEARCH_WEB_TOOL_NAME,
        content: "",
        error: validationError,
      };
    }

    const normalizedInput = normalizeSearchInput(input);
    const config = loadSearchProviderConfig();
    const provider = getSearchProvider(config);

    try {
      const results = await provider.search(normalizedInput, config);
      return buildSuccessResult(config, normalizedInput, results);
    } catch (error) {
      return buildErrorResult(error);
    }
  },
};
