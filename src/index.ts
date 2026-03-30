import "dotenv/config";
import {
  getMissingModelConfigKeys,
  hasCompleteModelConfig,
  loadModelConfig,
} from "./llm/modelConfig.js";
import { runAgent } from "./engine/runAgent.js";
import { buildSystemPrompt } from "./prompts/systemPrompt.js";
import { buildReportMarkdown } from "./report/buildReport.js";
import { saveReport } from "./report/saveReport.js";

async function main(): Promise<void> {
  const modelConfig = loadModelConfig();
  const topic = process.argv.slice(2).join(" ").trim();

  console.log("Research Assistant skeleton initialized.");
  console.log(`System prompt loaded: ${buildSystemPrompt().length} characters.`);

  if (!hasCompleteModelConfig(modelConfig)) {
    const missingKeys = getMissingModelConfigKeys(modelConfig);
    console.log("Model configuration status: incomplete.");
    console.log(`Missing env keys: ${missingKeys.join(", ")}`);
    console.log("Copy .env.example to .env and fill in the placeholders later.");
    return;
  }

  console.log("Model configuration status: ready.");
  console.log(`Configured model: ${modelConfig.model}`);

  if (!topic) {
    console.log("Usage: pnpm dev \"your research topic\"");
    return;
  }

  const result = await runAgent({ topic });
  const markdown = buildReportMarkdown(result);
  const reportPath = await saveReport(topic, markdown);
  console.log(`Iterations used: ${result.iterations}`);
  console.log("Final answer:");
  console.log(result.finalAnswer);
  console.log(`Report saved to: ${reportPath}`);
}

void main();
