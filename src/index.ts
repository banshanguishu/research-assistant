import {
  getMissingModelConfigKeys,
  hasCompleteModelConfig,
  loadModelConfig,
} from "./llm/modelConfig.js";

function main(): void {
  const modelConfig = loadModelConfig();

  console.log("Research Assistant skeleton initialized.");

  if (hasCompleteModelConfig(modelConfig)) {
    console.log("Model configuration status: ready.");
    console.log(`Configured model: ${modelConfig.model}`);
    return;
  }

  const missingKeys = getMissingModelConfigKeys(modelConfig);
  console.log("Model configuration status: incomplete.");
  console.log(`Missing env keys: ${missingKeys.join(", ")}`);
  console.log("Copy .env.example to .env and fill in the placeholders later.");
}

main();
