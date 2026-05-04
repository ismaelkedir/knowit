import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MemoryService } from "../services/memoryService.js";
import { resetDatabase } from "../db/database.js";
import type { KnownSourceProvider } from "../types/source.js";
import type { KnowledgeType } from "../types/knowledge.js";

export type SupportedClient =
  | "claude"
  | "codex"
  | "cursor"
  | "windsurf"
  | "vscode"
  | "gemini"
  | "kiro"
  | "cline"
  | "continue"
  | "zed"
  | "jetbrains";
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
  installGlobally?: boolean;
  useNpxForMcp?: boolean;
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
  projectMcpConfigPath: string | null;
  mcpConfigTargets: InstallMcpConfigTarget[];
  markdownImports: MarkdownImportPlan[];
  mcpRegistrations: ClientRegistrationPlan[];
  warnings: string[];
  globalInstallRequested: boolean;
  useNpxForMcp: boolean;
}

export interface InstallInstructionTarget {
  client: SupportedClient;
  path: string;
}

export interface InstallMcpConfigTarget {
  client: SupportedClient;
  path: string;
  format: "mcpServersJson" | "vscodeServersJson" | "continueYaml" | "zedContextServersJson";
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
  registrationOutcomes: ClientRegistrationOutcome[];
  globalInstallSucceeded?: boolean;
}

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): void;
}

export interface ClientRegistrationOutcome {
  client: SupportedClient;
  succeeded: boolean;
  command: string;
  error?: string;
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

export const formatCommand = (command: string, args: string[]): string =>
  [command, ...args]
    .map((part) => (/[\s"'$]/.test(part) ? JSON.stringify(part) : part))
    .join(" ");

const detectExistingSourceProvider = (filePath: string): KnownSourceProvider | null => {
  if (!fs.existsSync(filePath)) return null;
  const contents = fs.readFileSync(filePath, "utf8");
  const startIndex = contents.indexOf(knowitStartMarker);
  const endIndex = contents.indexOf(knowitEndMarker);
  if (startIndex < 0 || endIndex <= startIndex) return null;
  const block = contents.slice(startIndex, endIndex + knowitEndMarker.length);
  if (block.includes("resolve_source_action")) return "notion";
  if (block.includes("resolve_context")) return "local";
  return null;
};

const ignoredDirectories = new Set([".git", ".knowit", "node_modules", "dist", "coverage"]);
const ignoredMarkdownFiles = new Set(["readme.md", "changelog.md", "license.md"]);
const preferredMarkdownPatterns = [
  /^architecture\.md$/i,
  /^conventions?\.md$/i,
  /^patterns?\.md$/i,
  /^design[-_ ]?decisions?\.md$/i,
  /^decisions?\.md$/i,
  /^prd\.md$/i,
  /^adr[-_ ].*\.md$/i,
  /^adr\d+.*\.md$/i,
];

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

const getMcpConfigTarget = (client: SupportedClient, scope: InstallScope, cwd: string): InstallMcpConfigTarget | null => {
  if (client === "cursor") {
    return {
      client,
      path: scope === "project" ? path.join(cwd, ".cursor", "mcp.json") : path.join(os.homedir(), ".cursor", "mcp.json"),
      format: "mcpServersJson",
    };
  }

  if (client === "windsurf") {
    return {
      client,
      path: path.join(os.homedir(), ".codeium", "windsurf", "mcp_config.json"),
      format: "mcpServersJson",
    };
  }

  if (client === "vscode") {
    if (scope !== "project") {
      return null;
    }
    return {
      client,
      path: path.join(cwd, ".vscode", "mcp.json"),
      format: "vscodeServersJson",
    };
  }

  if (client === "gemini") {
    return {
      client,
      path: scope === "project" ? path.join(cwd, ".gemini", "settings.json") : path.join(os.homedir(), ".gemini", "settings.json"),
      format: "mcpServersJson",
    };
  }

  if (client === "kiro") {
    return {
      client,
      path: scope === "project"
        ? path.join(cwd, ".kiro", "settings", "mcp.json")
        : path.join(os.homedir(), ".kiro", "settings", "mcp.json"),
      format: "mcpServersJson",
    };
  }

  if (client === "cline") {
    return {
      client,
      path: path.join(os.homedir(), ".cline", "data", "settings", "cline_mcp_settings.json"),
      format: "mcpServersJson",
    };
  }

  if (client === "continue") {
    if (scope !== "project") {
      return null;
    }
    return {
      client,
      path: path.join(cwd, ".continue", "mcpServers", "knowit.yaml"),
      format: "continueYaml",
    };
  }

  if (client === "zed") {
    return {
      client,
      path: path.join(os.homedir(), ".config", "zed", "settings.json"),
      format: "zedContextServersJson",
    };
  }

  return null;
};

const getInstallDatabasePath = (scope: InstallScope, cwd: string): string =>
  scope === "global" ? path.join(os.homedir(), ".knowit", "knowit.db") : path.join(cwd, ".knowit", "knowit.db");

const getProjectMcpConfigPath = (scope: InstallScope, cwd: string): string | null =>
  scope === "project" ? path.join(cwd, ".mcp.json") : null;

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
    "This project uses Knowit as the default persistent knowledge base for AI coding agents.",
    "",
    "- Before planning or implementing, check Knowit for relevant project context.",
    routeLine,
    "- After finishing a task, store any durable rules, decisions, patterns, or conventions back into Knowit.",
    "- Prefer Knowit over repo-local markdown memory files unless the user explicitly asks for a file.",
    sourceProvider === "local"
      ? "- When a task creates durable documentation, consult Knowit first and only write repo markdown when explicitly requested."
      : "- When Knowit routes you to an external provider, use the returned MCP guidance instead of guessing the downstream tool.",
    "- Never store sensitive information such as credentials, API keys, tokens, or personal data.",
    "- Never store proprietary or closed-source implementation details when working in an open-source project context.",
    "- Only store knowledge directly relevant to the current project — skip observations about unrelated systems or codebases.",
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

export const buildMarkdownImportPlan = (filePath: string, cwd: string): MarkdownImportPlan => {
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
  dbPath: string | null,
  useNpx: boolean,
): ClientRegistrationPlan => {
  const serverCommand = useNpx ? "npx" : "knowit";
  const serverArgs = useNpx ? ["-y", "knowit@latest", "serve"] : ["serve"];
  const envArgs = scope === "global" && dbPath ? ["-e", `KNOWIT_DB_PATH=${dbPath}`] : [];
  const codexEnvArgs = scope === "global" && dbPath ? ["--env", `KNOWIT_DB_PATH=${dbPath}`] : [];

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
        serverCommand,
        ...serverArgs,
        ...envArgs,
      ],
    };
  }

  if (client === "codex") {
    return {
      client,
      command: "codex",
      args: ["mcp", "add", "knowit", ...codexEnvArgs, "--", serverCommand, ...serverArgs],
    };
  }

  throw new Error(`Client ${client} does not use CLI MCP registration.`);
};

const buildServerConfig = (useNpx: boolean, includeType: boolean = true): Record<string, unknown> => ({
  ...(includeType ? { type: "stdio" } : {}),
  command: useNpx ? "npx" : "knowit",
  args: useNpx ? ["-y", "knowit@latest", "serve"] : ["serve"],
});

const mergeJsonObject = (
  existingContents: string | null,
  key: "mcpServers" | "servers" | "context_servers",
  useNpx: boolean,
  includeType: boolean,
): string => {
  const parsed =
    existingContents && existingContents.trim().length > 0
      ? (JSON.parse(existingContents) as Record<string, unknown>)
      : {};

  const existingServers =
    parsed[key] && typeof parsed[key] === "object" && !Array.isArray(parsed[key])
      ? (parsed[key] as Record<string, unknown>)
      : {};

  return `${JSON.stringify(
    {
      ...parsed,
      [key]: {
        ...existingServers,
        knowit: buildServerConfig(useNpx, includeType),
      },
    },
    null,
    2,
  )}\n`;
};

const mergeMcpClientConfig = (
  existingContents: string | null,
  target: InstallMcpConfigTarget,
  useNpx: boolean,
): string => {
  if (target.format === "vscodeServersJson") {
    return mergeJsonObject(existingContents, "servers", useNpx, true);
  }

  if (target.format === "zedContextServersJson") {
    return mergeJsonObject(existingContents, "context_servers", useNpx, false);
  }

  if (target.format === "continueYaml") {
    const command = useNpx ? "npx" : "knowit";
    const args = useNpx ? ["-y", "knowit@latest", "serve"] : ["serve"];
    return [
      "name: Knowit",
      "version: 0.0.1",
      "schema: v1",
      "mcpServers:",
      "  - name: Knowit",
      "    type: stdio",
      `    command: ${command}`,
      "    args:",
      ...args.map((arg) => `      - ${JSON.stringify(arg)}`),
      "",
    ].join("\n");
  }

  return mergeJsonObject(existingContents, "mcpServers", useNpx, true);
};

const isCliRegisteredClient = (client: SupportedClient): boolean => client === "claude" || client === "codex";

const buildCliRegistrationPlan = (
  client: SupportedClient,
  scope: InstallScope,
  dbPath: string | null,
  useNpx: boolean,
): ClientRegistrationPlan | null => {
  if (!isCliRegisteredClient(client)) {
    return null;
  }

  return buildMcpRegistrationPlan(client, scope, dbPath, useNpx);
};

const mergeProjectMcpConfig = (existingContents: string | null, useNpx: boolean): string => {
  return mergeJsonObject(existingContents, "mcpServers", useNpx, true);
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

  const globalInstallRequested = selections.installGlobally ?? false;
  const useNpxForMcp = selections.useNpxForMcp ?? false;
  const mcpConfigTargets = selections.clients
    .map((client) => getMcpConfigTarget(client, selections.scope, selections.cwd))
    .filter((target): target is InstallMcpConfigTarget => target !== null);
  const mcpRegistrations = selections.clients
    .map((client) =>
      buildCliRegistrationPlan(
        client,
        selections.scope,
        selections.scope === "global" ? getInstallDatabasePath(selections.scope, selections.cwd) : null,
        useNpxForMcp,
      ),
    )
    .filter((registration): registration is ClientRegistrationPlan => registration !== null);

  const warnings: string[] = [];
  if (selections.scope === "project" && selections.clients.includes("codex")) {
    warnings.push(
      "Codex MCP registration is installed through the user-level Codex CLI; project scope currently only affects the instruction file path.",
    );
  }
  if (selections.scope === "project" && selections.clients.includes("windsurf")) {
    warnings.push("Windsurf documents a user-level MCP config path, so Knowit will update Windsurf's user MCP config.");
  }
  if (selections.scope === "project" && selections.clients.includes("cline")) {
    warnings.push("Cline stores MCP servers in user-level settings, so Knowit will update Cline's user MCP config.");
  }
  if (selections.scope === "project" && selections.clients.includes("zed")) {
    warnings.push("Zed stores custom MCP context servers in user settings, so Knowit will update Zed's user settings.");
  }
  if (selections.clients.includes("jetbrains")) {
    warnings.push(
      "JetBrains AI Assistant currently requires adding MCP JSON through the IDE settings UI; Knowit will only update the instruction file.",
    );
  }
  if (selections.scope === "global" && selections.clients.includes("vscode")) {
    warnings.push("VS Code user profile MCP paths vary by profile; Knowit only writes VS Code MCP config for project installs.");
  }
  if (selections.scope === "global" && selections.clients.includes("continue")) {
    warnings.push("Continue's documented standalone MCP block path is workspace-scoped; Knowit only writes Continue MCP config for project installs.");
  }
  if (selections.sourceProvider !== "local") {
    warnings.push(
      "External routed sources become the default for resolve_source_action, while direct Knowit storage still falls back to the local source.",
    );
  }

  const seenSourceChanges = new Set<string>();
  for (const target of instructionTargets) {
    const existingProvider = detectExistingSourceProvider(target.path);
    if (existingProvider !== null && existingProvider !== selections.sourceProvider) {
      const key = `${existingProvider}->${selections.sourceProvider}`;
      if (!seenSourceChanges.has(key)) {
        seenSourceChanges.add(key);
        warnings.push(
          `Source changing from "${existingProvider}" to "${selections.sourceProvider}" — existing knowledge in the local store will not be removed, but "${selections.sourceProvider}" becomes the new default.`,
        );
      }
    }
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
    projectMcpConfigPath: getProjectMcpConfigPath(selections.scope, selections.cwd),
    mcpConfigTargets,
    markdownImports,
    mcpRegistrations,
    warnings,
    globalInstallRequested,
    useNpxForMcp,
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

  let globalInstallSucceeded: boolean | undefined;
  if (plan.globalInstallRequested) {
    try {
      runner.run("npm", ["install", "-g", "knowit"], options.cwd);
      globalInstallSucceeded = true;
    } catch {
      globalInstallSucceeded = false;
    }
  }

  const originalDbPath = process.env.KNOWIT_DB_PATH;
  const originalStorageScope = process.env.KNOWIT_STORAGE_SCOPE;
  const originalCwd = process.cwd();

  process.chdir(options.cwd);
  process.env.KNOWIT_STORAGE_SCOPE = plan.scope;
  if (plan.scope === "global") {
    process.env.KNOWIT_DB_PATH = plan.dbPath;
  } else {
    delete process.env.KNOWIT_DB_PATH;
  }
  resetDatabase();

  try {
    const service = options.memoryService ?? new MemoryService();
    service.init();
    service.connectKnownSource({
      provider: plan.sourceProvider,
      mcpServerName: plan.sourceProvider === "local" ? undefined : plan.sourceMcpServerName,
      isDefault: true,
    });

    const registrationOutcomes: ClientRegistrationOutcome[] = [];
    for (const registration of plan.mcpRegistrations) {
      const commandText = formatCommand(registration.command, registration.args);
      try {
        runner.run(registration.command, registration.args, options.cwd);
        registrationOutcomes.push({
          client: registration.client,
          succeeded: true,
          command: commandText,
        });
      } catch (error: unknown) {
        registrationOutcomes.push({
          client: registration.client,
          succeeded: false,
          command: commandText,
          error: error instanceof Error ? error.message : "Unknown registration error",
        });
      }
    }

    for (const target of plan.instructionTargets) {
      fs.mkdirSync(path.dirname(target.path), { recursive: true });
      const current = fs.existsSync(target.path) ? fs.readFileSync(target.path, "utf8") : null;
      const merged = mergeInstructionFile(current, target.client, plan.sourceProvider, plan.sourceId);
      fs.writeFileSync(target.path, merged, "utf8");
    }

    if (plan.projectMcpConfigPath) {
      const currentMcpConfig = fs.existsSync(plan.projectMcpConfigPath)
        ? fs.readFileSync(plan.projectMcpConfigPath, "utf8")
        : null;
      fs.writeFileSync(plan.projectMcpConfigPath, mergeProjectMcpConfig(currentMcpConfig, plan.useNpxForMcp), "utf8");
    }

    for (const target of plan.mcpConfigTargets) {
      fs.mkdirSync(path.dirname(target.path), { recursive: true });
      const currentMcpConfig = fs.existsSync(target.path) ? fs.readFileSync(target.path, "utf8") : null;
      fs.writeFileSync(target.path, mergeMcpClientConfig(currentMcpConfig, target, plan.useNpxForMcp), "utf8");
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
      registrationOutcomes,
      globalInstallSucceeded,
    };
  } finally {
    process.chdir(originalCwd);
    resetDatabase();
    if (originalDbPath === undefined) {
      delete process.env.KNOWIT_DB_PATH;
    } else {
      process.env.KNOWIT_DB_PATH = originalDbPath;
    }
    if (originalStorageScope === undefined) {
      delete process.env.KNOWIT_STORAGE_SCOPE;
    } else {
      process.env.KNOWIT_STORAGE_SCOPE = originalStorageScope;
    }
  }
};
