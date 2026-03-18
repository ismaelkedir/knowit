import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MemoryService } from "../services/memoryService.js";
import { resetDatabase } from "../db/database.js";
import type { KnownSourceProvider } from "../types/source.js";
import type { KnowledgeType } from "../types/knowledge.js";

export type SupportedClient = "claude" | "codex";
export type InstallScope = "project" | "global";

export interface InstallSelections {
  clients: SupportedClient[];
  scope: InstallScope;
  sourceProvider: KnownSourceProvider;
  mcpServerName?: string;
  migrateMarkdown: boolean;
  markdownPaths: string[];
  repo: string;
  cwd: string;
}

export interface InstallPlan {
  clients: SupportedClient[];
  scope: InstallScope;
  sourceProvider: KnownSourceProvider;
  sourceId: KnownSourceProvider;
  sourceMcpServerName?: string;
  repo: string;
  dbPath: string;
  instructionTargets: InstallInstructionTarget[];
  markdownImports: MarkdownImportPlan[];
  mcpRegistrations: ClientRegistrationPlan[];
  warnings: string[];
}

export interface InstallInstructionTarget {
  client: SupportedClient;
  path: string;
}

export interface MarkdownImportPlan {
  path: string;
  title: string;
  type: KnowledgeType;
  tags: string[];
}

export interface ClientRegistrationPlan {
  client: SupportedClient;
  command: string;
  args: string[];
}

export interface InstallResult {
  plan: InstallPlan;
  importedEntryCount: number;
  instructionPaths: string[];
}

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): void;
}

const knowitStartMarker = "<!-- knowit:start -->";
const knowitEndMarker = "<!-- knowit:end -->";

const defaultCommandRunner: CommandRunner = {
  run(command, args, cwd) {
    const result = spawnSync(command, args, {
      cwd,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(`Command failed: ${command} ${args.join(" ")}`.trim());
    }
  },
};

const ignoredDirectories = new Set([".git", ".knowit", "node_modules", "dist", "coverage"]);
const ignoredMarkdownFiles = new Set(["readme.md", "changelog.md", "license.md"]);
const preferredMarkdownPatterns = [
  /^agents\.md$/i,
  /^claude\.md$/i,
  /^architecture\.md$/i,
  /^conventions?\.md$/i,
  /^patterns?\.md$/i,
  /^design[-_ ]?decisions?\.md$/i,
  /^decisions?\.md$/i,
  /^prd\.md$/i,
  /^adr[-_ ].*\.md$/i,
  /^adr\d+.*\.md$/i,
];

const localCliPath = fileURLToPath(new URL("../cli/index.js", import.meta.url));

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const toTitleCase = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const inferKnowledgeType = (filename: string): KnowledgeType => {
  const normalized = filename.toLowerCase();

  if (normalized.includes("architecture")) {
    return "architecture";
  }
  if (normalized.includes("pattern")) {
    return "pattern";
  }
  if (normalized.includes("decision") || normalized.startsWith("adr") || normalized.includes("prd")) {
    return "decision";
  }
  if (normalized.includes("convention") || normalized.includes("agents") || normalized.includes("claude")) {
    return "convention";
  }
  if (normalized.includes("rule")) {
    return "rule";
  }

  return "note";
};

const inferTitleFromMarkdown = (filePath: string, contents: string): string => {
  const heading = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  if (heading) {
    return heading.replace(/^# /, "").trim();
  }

  return toTitleCase(path.basename(filePath, path.extname(filePath)));
};

const inferTags = (relativeFilePath: string, type: KnowledgeType): string[] => {
  const fileName = path.basename(relativeFilePath, path.extname(relativeFilePath)).toLowerCase();
  const relativeSegments = relativeFilePath
    .split(path.sep)
    .map((segment) => segment.toLowerCase())
    .filter(Boolean);

  return unique([type, fileName, ...relativeSegments.filter((segment) => segment !== "docs")]).slice(0, 8);
};

const isCandidateMarkdownFile = (filePath: string): boolean => {
  const baseName = path.basename(filePath).toLowerCase();
  if (!baseName.endsWith(".md")) {
    return false;
  }
  if (ignoredMarkdownFiles.has(baseName)) {
    return false;
  }

  return preferredMarkdownPatterns.some((pattern) => pattern.test(baseName));
};

const walkMarkdownFiles = (directory: string, root: string = directory): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }

      files.push(...walkMarkdownFiles(path.join(directory, entry.name), root));
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (isCandidateMarkdownFile(path.relative(root, absolutePath))) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
};

const getFirstExistingPath = (candidates: string[]): string | null =>
  candidates.find((candidate) => fs.existsSync(candidate)) ?? null;

const getInstructionPath = (client: SupportedClient, scope: InstallScope, cwd: string): string => {
  if (client === "claude") {
    if (scope === "project") {
      return (
        getFirstExistingPath([path.join(cwd, ".claude", "CLAUDE.md"), path.join(cwd, "CLAUDE.md")]) ??
        path.join(cwd, ".claude", "CLAUDE.md")
      );
    }

    return path.join(os.homedir(), ".claude", "CLAUDE.md");
  }

  if (scope === "project") {
    return (
      getFirstExistingPath([path.join(cwd, "AGENTS.md"), path.join(cwd, ".codex", "AGENTS.md")]) ??
      path.join(cwd, "AGENTS.md")
    );
  }

  return getFirstExistingPath([path.join(os.homedir(), "AGENTS.md"), path.join(os.homedir(), ".codex", "AGENTS.md")]) ??
    path.join(os.homedir(), "AGENTS.md");
};

const getInstallDatabasePath = (scope: InstallScope, cwd: string): string =>
  scope === "global" ? path.join(os.homedir(), ".knowit", "knowit.db") : path.join(cwd, ".knowit", "knowit.db");

const buildInstructionBlock = (
  client: SupportedClient,
  sourceProvider: KnownSourceProvider,
  sourceId: string,
): string => {
  const routeLine =
    sourceProvider === "local"
      ? "- Use `resolve_context` for implementation context and `store_knowledge` or `capture_session_learnings` to persist durable knowledge."
      : `- The preferred routed source is \`${sourceId}\`. For plans, PRDs, and durable docs, call \`resolve_source_action\` first and follow its downstream MCP guidance.`;

  return [
    knowitStartMarker,
    "## Knowit Memory",
    "",
    "This project uses Knowit as its persistent memory layer.",
    "",
    "- Before planning or implementing, check Knowit for relevant context.",
    routeLine,
    "- After finishing a task, store any durable rules, decisions, patterns, or conventions back into Knowit.",
    "- Prefer Knowit over repo-local markdown memory files unless the user explicitly asks for a file.",
    client === "codex"
      ? "- When a task creates durable documentation, consult Knowit first and only write repo markdown when explicitly requested."
      : "- When Knowit routes you to an external provider, use the returned MCP guidance instead of guessing the downstream tool.",
    knowitEndMarker,
  ].join("\n");
};

export const mergeInstructionFile = (
  existingContents: string | null,
  client: SupportedClient,
  sourceProvider: KnownSourceProvider,
  sourceId: string,
): string => {
  const block = buildInstructionBlock(client, sourceProvider, sourceId);

  if (!existingContents || existingContents.trim().length === 0) {
    return `${block}\n`;
  }

  const startIndex = existingContents.indexOf(knowitStartMarker);
  const endIndex = existingContents.indexOf(knowitEndMarker);

  if (startIndex >= 0 && endIndex > startIndex) {
    const prefix = existingContents.slice(0, startIndex).trimEnd();
    const suffix = existingContents.slice(endIndex + knowitEndMarker.length).trimStart();
    return [prefix, block, suffix].filter(Boolean).join("\n\n").concat("\n");
  }

  return `${existingContents.trimEnd()}\n\n${block}\n`;
};

const buildMarkdownImportPlan = (filePath: string, cwd: string): MarkdownImportPlan => {
  const contents = fs.readFileSync(filePath, "utf8");
  const title = inferTitleFromMarkdown(filePath, contents);
  const type = inferKnowledgeType(path.basename(filePath));
  const relativeFilePath = path.relative(cwd, filePath);

  return {
    path: filePath,
    title,
    type,
    tags: inferTags(relativeFilePath, type),
  };
};

const buildMcpRegistrationPlan = (
  client: SupportedClient,
  scope: InstallScope,
  dbPath: string,
): ClientRegistrationPlan => {
  const nodeBinary = process.execPath;
  const serverArgs = [localCliPath, "serve"];

  if (client === "claude") {
    const claudeScope = scope === "project" ? "project" : "user";
    return {
      client,
      command: "claude",
      args: [
        "mcp",
        "add",
        "-s",
        claudeScope,
        "knowit",
        nodeBinary,
        ...serverArgs,
        "-e",
        `KNOWIT_DB_PATH=${dbPath}`,
      ],
    };
  }

  return {
    client,
    command: "codex",
    args: ["mcp", "add", "knowit", "--env", `KNOWIT_DB_PATH=${dbPath}`, "--", nodeBinary, ...serverArgs],
  };
};

export const detectMarkdownCandidates = (cwd: string): string[] => walkMarkdownFiles(cwd);

export const createInstallPlan = (selections: InstallSelections): InstallPlan => {
  const instructionTargets = selections.clients.map((client) => ({
    client,
    path: getInstructionPath(client, selections.scope, selections.cwd),
  }));

  const markdownImports = selections.migrateMarkdown
    ? selections.markdownPaths.map((filePath) => buildMarkdownImportPlan(filePath, selections.cwd))
    : [];

  const warnings: string[] = [];
  if (selections.scope === "project" && selections.clients.includes("codex")) {
    warnings.push(
      "Codex MCP registration is installed through the user-level Codex CLI; project scope currently only affects the instruction file path.",
    );
  }
  if (selections.sourceProvider !== "local") {
    warnings.push(
      "External routed sources become the default for resolve_source_action, while direct Knowit storage still falls back to local SQLite.",
    );
  }

  return {
    clients: selections.clients,
    scope: selections.scope,
    sourceProvider: selections.sourceProvider,
    sourceId: selections.sourceProvider,
    sourceMcpServerName: selections.mcpServerName,
    repo: selections.repo,
    dbPath: getInstallDatabasePath(selections.scope, selections.cwd),
    instructionTargets,
    markdownImports,
    mcpRegistrations: selections.clients.map((client) =>
      buildMcpRegistrationPlan(client, selections.scope, getInstallDatabasePath(selections.scope, selections.cwd)),
    ),
    warnings,
  };
};

export const applyInstallPlan = async (
  plan: InstallPlan,
  options: {
    cwd: string;
    memoryService?: MemoryService;
    runner?: CommandRunner;
  },
): Promise<InstallResult> => {
  const runner = options.runner ?? defaultCommandRunner;
  const originalDbPath = process.env.KNOWIT_DB_PATH;

  process.env.KNOWIT_DB_PATH = plan.dbPath;
  resetDatabase();

  try {
    const service = options.memoryService ?? new MemoryService();
    service.init();
    service.connectKnownSource({
      provider: plan.sourceProvider,
      mcpServerName: plan.sourceProvider === "local" ? undefined : plan.sourceMcpServerName,
      isDefault: true,
    });

    for (const registration of plan.mcpRegistrations) {
      runner.run(registration.command, registration.args, options.cwd);
    }

    for (const target of plan.instructionTargets) {
      fs.mkdirSync(path.dirname(target.path), { recursive: true });
      const current = fs.existsSync(target.path) ? fs.readFileSync(target.path, "utf8") : null;
      const merged = mergeInstructionFile(current, target.client, plan.sourceProvider, plan.sourceId);
      fs.writeFileSync(target.path, merged, "utf8");
    }

    let importedEntryCount = 0;
    for (const markdownFile of plan.markdownImports) {
      const contents = fs.readFileSync(markdownFile.path, "utf8").trim();
      if (!contents) {
        continue;
      }

      await service.storeKnowledge({
        source: "local",
        title: markdownFile.title,
        type: markdownFile.type,
        content: contents,
        scope: "repo",
        repo: plan.repo,
        tags: markdownFile.tags,
        confidence: 0.95,
        metadata: {
          importedFromPath: path.relative(options.cwd, markdownFile.path),
          importedBy: "knowit-install",
        },
      });
      importedEntryCount += 1;
    }

    return {
      plan,
      importedEntryCount,
      instructionPaths: plan.instructionTargets.map((target) => target.path),
    };
  } finally {
    resetDatabase();
    if (originalDbPath === undefined) {
      delete process.env.KNOWIT_DB_PATH;
    } else {
      process.env.KNOWIT_DB_PATH = originalDbPath;
    }
  }
};
