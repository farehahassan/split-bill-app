type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  meta?: Record<string, unknown>;
}

let _silent = false;

export function setSilent(silent: boolean): void {
  _silent = silent;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (_silent) return;

  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    message,
  };
  if (meta) entry.meta = meta;

  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
};
