import type { RunAgentResult } from "../engine/runAgent.js";

interface ReferenceItem {
  title: string;
  url: string;
}

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractReferences(runResult: RunAgentResult): ReferenceItem[] {
  const referenceMap = new Map<string, ReferenceItem>();

  for (const toolResult of runResult.toolResults) {
    if (!toolResult.success || toolResult.content.trim().length === 0) {
      continue;
    }

    const parsed = safeParseJson(toolResult.content);

    if (!parsed || typeof parsed !== "object") {
      continue;
    }

    if ("results" in parsed && Array.isArray(parsed.results)) {
      for (const item of parsed.results) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const title =
          "title" in item && typeof item.title === "string"
            ? item.title
            : "Untitled source";
        const url =
          "url" in item && typeof item.url === "string" ? item.url : "";

        if (url) {
          referenceMap.set(url, { title, url });
        }
      }
    }

    if ("url" in parsed && typeof parsed.url === "string") {
      const title =
        "title" in parsed && typeof parsed.title === "string"
          ? parsed.title
          : "Untitled page";

      referenceMap.set(parsed.url, {
        title,
        url: parsed.url,
      });
    }
  }

  return Array.from(referenceMap.values());
}

function buildToolSummary(runResult: RunAgentResult): string {
  if (runResult.toolResults.length === 0) {
    return "- 本次运行没有触发工具调用。";
  }

  return runResult.toolResults
    .map((toolResult, index) => {
      const status = toolResult.success ? "成功" : "失败";
      const detail = toolResult.success
        ? toolResult.toolName
        : `${toolResult.toolName}：${toolResult.error ?? "未知错误"}`;

      return `${index + 1}. ${status} - ${detail}`;
    })
    .join("\n");
}

function buildReferenceSection(references: ReferenceItem[]): string {
  if (references.length === 0) {
    return "- 本次运行暂未提取出可用参考链接。";
  }

  return references.map((item) => `- [${item.title}](${item.url})`).join("\n");
}

export function buildReportMarkdown(runResult: RunAgentResult): string {
  const references = extractReferences(runResult);
  const generatedAt = new Date().toISOString();

  return [
    `# ${runResult.topic}`,
    "",
    "## 引言",
    "",
    `本报告由 Research Assistant Agent 自动生成，主题为“${runResult.topic}”。`,
    "",
    "## 研究过程概览",
    "",
    `- 执行轮次：${runResult.iterations}`,
    `- 工具调用次数：${runResult.toolResults.length}`,
    `- 生成时间：${generatedAt}`,
    "",
    "## 工具执行摘要",
    "",
    buildToolSummary(runResult),
    "",
    "## 多维分析",
    "",
    runResult.finalAnswer.trim().length > 0
      ? runResult.finalAnswer
      : "当前未生成有效分析内容。",
    "",
    "## 结论",
    "",
    runResult.finalAnswer.trim().length > 0
      ? runResult.finalAnswer
      : "当前未生成有效结论。",
    "",
    "## 参考资料",
    "",
    buildReferenceSection(references),
    "",
  ].join("\n");
}
