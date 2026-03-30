import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface Logger {
  step: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface LoggerOptions {
  enabled?: boolean;
  filePath?: string | null;
}

function buildLogLine(prefix: string, message: string): string {
  return `${prefix} ${message}`;
}

function writeToFile(filePath: string, line: string): void {
  appendFileSync(filePath, `${line}\n`, "utf8");
}

function ensureUtf8LogFile(filePath: string): void {
  const utf8Bom = "\uFEFF";

  if (!existsSync(filePath)) {
    writeFileSync(filePath, utf8Bom, "utf8");
    return;
  }

  const currentContent = readFileSync(filePath);
  const hasUtf8Bom =
    currentContent.length >= 3 &&
    currentContent[0] === 0xef &&
    currentContent[1] === 0xbb &&
    currentContent[2] === 0xbf;

  if (!hasUtf8Bom) {
    writeFileSync(filePath, utf8Bom, "utf8");
  }
}

function write(prefix: string, message: string, filePath?: string | null): void {
  const line = buildLogLine(prefix, message);
  console.log(line);

  if (!filePath) {
    return;
  }

  try {
    writeToFile(filePath, line);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown file logging error.";
    console.warn(`[WARN] Failed to write logger output to file: ${reason}`);
  }
}

export function createLogger(options: LoggerOptions | boolean = true): Logger {
  const normalizedOptions =
    typeof options === "boolean" ? { enabled: options } : options;
  const enabled = normalizedOptions.enabled ?? true;
  const filePath =
    normalizedOptions.filePath === undefined
      ? path.resolve(process.cwd(), "agent.log")
      : normalizedOptions.filePath;

  if (!enabled) {
    const noop = (): void => {};

    return {
      step: noop,
      info: noop,
      warn: noop,
      error: noop,
    };
  }

  if (filePath) {
    ensureUtf8LogFile(filePath);
  }

  return {
    step: (message: string): void => write("[STEP]", message, filePath),
    info: (message: string): void => write("[INFO]", message, filePath),
    warn: (message: string): void => write("[WARN]", message, filePath),
    error: (message: string): void => write("[ERROR]", message, filePath),
  };
}
