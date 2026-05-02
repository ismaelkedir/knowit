import type { Command } from "commander";

const startedAtKey = Symbol("knowit.cli.startedAt");

type TimedCommand = Command & {
  [startedAtKey]?: bigint;
};

export const shouldTimeCommand = (command: Command): boolean => {
  const name = command.name();
  return name.length > 0 && name !== "serve" && name !== "preview";
};

export const markCommandStart = (command: Command): void => {
  (command as TimedCommand)[startedAtKey] = process.hrtime.bigint();
};

export const clearCommandStart = (command: Command): void => {
  delete (command as TimedCommand)[startedAtKey];
};

export const getElapsedMs = (command: Command): number | null => {
  const startedAt = (command as TimedCommand)[startedAtKey];
  if (startedAt === undefined) {
    return null;
  }

  const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
  return Number(elapsedNanoseconds) / 1_000_000;
};

export const getTotalElapsedMs = (): number => process.uptime() * 1000;

export const formatElapsedMs = (elapsedMs: number): string => {
  if (elapsedMs < 1000) {
    return `${elapsedMs.toFixed(1)}ms`;
  }

  return `${(elapsedMs / 1000).toFixed(2)}s`;
};

const getCommandPath = (command: Command): string => {
  const names: string[] = [];
  let current: Command | null = command;

  while (current) {
    const name = current.name();
    if (name.length > 0) {
      names.unshift(name);
    }
    current = current.parent ?? null;
  }

  return names.join(" ");
};

export const printCommandElapsed = (command: Command, failed = false): void => {
  const actionElapsedMs = getElapsedMs(command);
  if (actionElapsedMs === null) {
    return;
  }

  const commandPath = getCommandPath(command);
  const status = failed ? "failed" : "ok";
  process.stderr.write(
    `${commandPath} ${status} action_elapsed=${formatElapsedMs(actionElapsedMs)} total_elapsed=${formatElapsedMs(getTotalElapsedMs())}\n`,
  );
};
