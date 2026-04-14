import updateNotifier from "update-notifier";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { name: string; version: string };

const NON_INTERACTIVE_COMMANDS = new Set(["serve"]);
const NON_INTERACTIVE_FLAGS = new Set(["--help", "-h", "--version", "-V"]);

export const shouldCheckForUpdates = (argv: readonly string[]): boolean => {
  for (const argument of argv) {
    if (argument === "--") {
      break;
    }

    if (NON_INTERACTIVE_FLAGS.has(argument)) {
      return false;
    }

    if (argument.startsWith("-")) {
      continue;
    }

    return !NON_INTERACTIVE_COMMANDS.has(argument);
  }

  return true;
};

export const notifyIfUpdateAvailable = (argv: readonly string[]): void => {
  if (!shouldCheckForUpdates(argv)) {
    return;
  }

  updateNotifier({
    pkg: packageJson,
  }).notify();
};

