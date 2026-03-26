export interface ModelConfig {
  apiKey: string | null;
  baseURL: string | null;
  model: string | null;
}

export interface ResolvedModelConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

const MODEL_ENV_KEYS = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"] as const;

type ModelEnvKey = (typeof MODEL_ENV_KEYS)[number];

function readEnv(name: ModelEnvKey): string | null {
  const value = process.env[name];

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function loadModelConfig(): ModelConfig {
  return {
    apiKey: readEnv("LLM_API_KEY"),
    baseURL: readEnv("LLM_BASE_URL"),
    model: readEnv("LLM_MODEL"),
  };
}

export function getMissingModelConfigKeys(
  config: ModelConfig = loadModelConfig(),
): ModelEnvKey[] {
  return MODEL_ENV_KEYS.filter((key) => {
    if (key === "LLM_API_KEY") {
      return !config.apiKey;
    }

    if (key === "LLM_BASE_URL") {
      return !config.baseURL;
    }

    return !config.model;
  });
}

export function hasCompleteModelConfig(
  config: ModelConfig = loadModelConfig(),
): config is ResolvedModelConfig {
  return getMissingModelConfigKeys(config).length === 0;
}

export function assertModelConfig(
  config: ModelConfig = loadModelConfig(),
): ResolvedModelConfig {
  const missingKeys = getMissingModelConfigKeys(config);

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing model configuration: ${missingKeys.join(", ")}. ` +
        "Please fill them in your environment before calling the LLM SDK.",
    );
  }

  return {
    apiKey: config.apiKey as string,
    baseURL: config.baseURL as string,
    model: config.model as string,
  };
}
