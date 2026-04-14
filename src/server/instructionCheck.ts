import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const KNOWIT_MARKER = "<!-- knowit:start -->";

const CANDIDATE_PATHS = (cwd: string, includeGlobal: boolean): string[] => [
  path.join(cwd, "CLAUDE.md"),
  path.join(cwd, ".claude", "CLAUDE.md"),
  ...(includeGlobal ? [path.join(os.homedir(), ".claude", "CLAUDE.md")] : []),
  path.join(cwd, "AGENTS.md"),
  path.join(cwd, ".codex", "AGENTS.md"),
  ...(includeGlobal ? [path.join(os.homedir(), "AGENTS.md"), path.join(os.homedir(), ".codex", "AGENTS.md")] : []),
];

export function checkInstructionsInstalled(cwd: string = process.cwd()): boolean {
  const includeGlobal = cwd === process.cwd();
  return CANDIDATE_PATHS(cwd, includeGlobal).some((filePath) => {
    try {
      return fs.readFileSync(filePath, "utf8").includes(KNOWIT_MARKER);
    } catch {
      return false;
    }
  });
}

export const INSTRUCTIONS_WARNING =
  "⚠️  Knowit instructions are not installed in any agent config file " +
  "(CLAUDE.md, AGENTS.md, etc.). Without them, your AI agent won't know to " +
  "use Knowit proactively. Run `knowit install` to add them automatically.";
