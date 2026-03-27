import { tavily } from "@tavily/core";
import type { ToolDefinition, ToolExecutionResult } from "./types.js";

type FetchProviderName = "mock" | "tavily";

export interface FetchPageContentInput {
  url: string;
  format?: "markdown" | "text";
  extractDepth?: "basic" | "advanced";
}

interface FetchProviderConfig {
  provider: FetchProviderName;
  apiKey: string | null;
  baseURL: string | null;
}

interface PageContentResult {
  url: string;
  title: string;
  content: string;
  excerpt: string;
}

interface FetchProvider {
  fetchPageContent: (
    input: FetchPageContentInput,
    config: FetchProviderConfig,
  ) => Promise<PageContentResult>;
}

const FETCH_PAGE_CONTENT_TOOL_NAME = "fetch_page_content";
const DEFAULT_TAVILY_BASE_URL = "https://api.tavily.com";
const DEFAULT_EXCERPT_LENGTH = 1200;

function readEnv(name: string): string | null {
  const value = process.env[name];

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function loadFetchProviderConfig(): FetchProviderConfig {
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

function getTavilyBaseUrl(config: FetchProviderConfig): string {
  return config.baseURL ?? DEFAULT_TAVILY_BASE_URL;
}

function createExcerpt(content: string): string {
  if (content.length <= DEFAULT_EXCERPT_LENGTH) {
    return content;
  }

  return `${content.slice(0, DEFAULT_EXCERPT_LENGTH)}...`;
}

function normalizeInput(input: FetchPageContentInput): FetchPageContentInput {
  return {
    url: input.url.trim(),
    format: input.format ?? "markdown",
    extractDepth: input.extractDepth ?? "basic",
  };
}

function validateInput(input: FetchPageContentInput): string | null {
  if (typeof input.url !== "string" || input.url.trim().length === 0) {
    return "The url must be a non-empty string.";
  }

  try {
    new URL(input.url);
  } catch {
    return "The url must be a valid absolute URL.";
  }

  return null;
}

function formatPageContentResult(
  provider: FetchProviderName,
  result: PageContentResult,
): string {
  return JSON.stringify(
    {
      provider,
      ...result,
    },
    null,
    2,
  );
}

const mockFetchProvider: FetchProvider = {
  async fetchPageContent(input: FetchPageContentInput): Promise<PageContentResult> {
    const content =
      "这是一个 mock 正文提取结果，用于先打通 fetch_page_content 工具链路。" +
      "后续切换到 Tavily 模式后，这里会返回真实网页的标题与正文内容。";

    return {
      url: input.url,
      title: "Mock Page Content",
      content,
      excerpt: createExcerpt(content),
    };
  },
};

const tavilyFetchProvider: FetchProvider = {
  async fetchPageContent(
    input: FetchPageContentInput,
    config: FetchProviderConfig,
  ): Promise<PageContentResult> {
    if (!config.apiKey) {
      throw new Error("SEARCH_API_KEY is required when SEARCH_PROVIDER=tavily.");
    }

    const client = tavily({
      apiKey: config.apiKey,
      apiBaseURL: getTavilyBaseUrl(config),
    });

    const response = await client.extract([input.url], {
      format: input.format,
      extractDepth: input.extractDepth,
    });

    const firstFailure = response.failedResults[0];

    if (firstFailure) {
      throw new Error(firstFailure.error);
    }

    const firstResult = response.results[0];

    if (!firstResult) {
      throw new Error("Tavily extract returned no content.");
    }

    const content = firstResult.rawContent ?? "";

    return {
      url: firstResult.url,
      title: firstResult.title ?? "Untitled page",
      content,
      excerpt: createExcerpt(content),
    };
  },
};

function getFetchProvider(config: FetchProviderConfig): FetchProvider {
  if (config.provider === "tavily") {
    return tavilyFetchProvider;
  }

  return mockFetchProvider;
}

function buildSuccessResult(
  config: FetchProviderConfig,
  result: PageContentResult,
): ToolExecutionResult {
  return {
    success: true,
    toolName: FETCH_PAGE_CONTENT_TOOL_NAME,
    content: formatPageContentResult(config.provider, result),
  };
}

function buildErrorResult(error: unknown): ToolExecutionResult {
  const message =
    error instanceof Error ? error.message : "Unknown fetch page content error.";

  return {
    success: false,
    toolName: FETCH_PAGE_CONTENT_TOOL_NAME,
    content: "",
    error: message,
  };
}

export const fetchPageContentTool: ToolDefinition<FetchPageContentInput> = {
  name: FETCH_PAGE_CONTENT_TOOL_NAME,
  description:
    "Fetch the main content of a page from a URL and return the title, full content, and excerpt.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The target page URL to extract content from.",
      },
      format: {
        type: "string",
        enum: ["markdown", "text"],
        description: "The output content format.",
      },
      extractDepth: {
        type: "string",
        enum: ["basic", "advanced"],
        description: "The extraction depth used by the provider.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  async execute(input: FetchPageContentInput): Promise<ToolExecutionResult> {
    const validationError = validateInput(input);

    if (validationError) {
      return {
        success: false,
        toolName: FETCH_PAGE_CONTENT_TOOL_NAME,
        content: "",
        error: validationError,
      };
    }

    const normalizedInput = normalizeInput(input);
    const config = loadFetchProviderConfig();
    const provider = getFetchProvider(config);

    try {
      const result = await provider.fetchPageContent(normalizedInput, config);
      return buildSuccessResult(config, result);
    } catch (error) {
      return buildErrorResult(error);
    }
  },
};
