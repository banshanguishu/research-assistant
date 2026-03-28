import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export async function saveReport(
  topic: string,
  markdown: string,
): Promise<string> {
  const outputDir = path.resolve(process.cwd(), "output");
  const fileName = `${sanitizeFileName(topic) || "research-report"}.md`;
  const filePath = path.join(outputDir, fileName);

  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, markdown, "utf8");

  return filePath;
}
