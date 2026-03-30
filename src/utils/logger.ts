export interface Logger {
  step: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

function write(prefix: string, message: string): void {
  console.log(`${prefix} ${message}`);
}

export function createLogger(enabled = true): Logger {
  if (!enabled) {
    const noop = (): void => {};

    return {
      step: noop,
      info: noop,
      warn: noop,
      error: noop,
    };
  }

  return {
    step: (message: string): void => write("[STEP]", message),
    info: (message: string): void => write("[INFO]", message),
    warn: (message: string): void => write("[WARN]", message),
    error: (message: string): void => write("[ERROR]", message),
  };
}
