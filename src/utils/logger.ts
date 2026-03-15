type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = (process.env.KNOWIT_LOG_LEVEL?.toLowerCase() as LogLevel | undefined) ?? "info";

const formatMessage = (level: LogLevel, message: string, meta?: Record<string, unknown>): string => {
  const timestamp = new Date().toISOString();
  const metaSuffix = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] ${level.toUpperCase()} ${message}${metaSuffix}`;
};

const shouldLog = (level: LogLevel): boolean =>
  levelPriority[level] >= levelPriority[configuredLevel];

const emit = (level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
  if (!shouldLog(level)) {
    return;
  }

  console.error(formatMessage(level, message, meta));
};

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    emit("debug", message, meta);
  },
  info(message: string, meta?: Record<string, unknown>): void {
    emit("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    emit("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    emit("error", message, meta);
  },
};
