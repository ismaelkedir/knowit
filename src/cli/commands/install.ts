import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  applyInstallPlan,
  createInstallPlan,
  detectMarkdownCandidates,
  formatCommand,
  type InstallPlan,
  type InstallScope,
  type InstallSelections,
  type SupportedClient,
} from "../../install/installer.js";
import type { KnownSourceProvider } from "../../types/source.js";

interface InstallOptions {
  client?: string;
  scope?: string;
  source?: string;
  mcpServerName?: string;
  migrateMd?: boolean;
  markdownPath?: string[];
  yes?: boolean;
  dryRun?: boolean;
}

const parseClients = (value: string | undefined): SupportedClient[] | null => {
  if (!value) {
    return null;
  }

  if (value === "both") {
    return ["claude", "codex"];
  }

  const clients = value.split(",").map((client) => client.trim()).filter(Boolean);
  const supportedClients = new Set<SupportedClient>([
    "claude",
    "codex",
    "cursor",
    "windsurf",
    "vscode",
    "gemini",
    "kiro",
    "cline",
    "continue",
    "zed",
    "jetbrains",
  ]);

  if (clients.length > 0 && clients.every((client): client is SupportedClient => supportedClients.has(client as SupportedClient))) {
    return clients;
  }

  throw new Error("client must be one of: claude, codex, cursor, windsurf, vscode, gemini, kiro, cline, continue, zed, jetbrains, both, or a comma-separated list");
};

const parseScope = (value: string | undefined): InstallScope | null => {
  if (!value) {
    return null;
  }
  if (value === "project" || value === "global") {
    return value;
  }
  throw new Error("scope must be one of: project, global");
};

const isGloballyInstalled = (): boolean => {
  const cmd = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(cmd, ["knowit"], { stdio: "pipe" });
  return result.status === 0;
};

const parseSource = (value: string | undefined): KnownSourceProvider | null => {
  if (!value) {
    return null;
  }
  if (value === "local" || value === "notion") {
    return value;
  }
  throw new Error("source must be one of: local, notion");
};

const hasCommand = (name: string): boolean => {
  const cmd = process.platform === "win32" ? "where" : "which";
  return spawnSync(cmd, [name], { stdio: "pipe" }).status === 0;
};

const dirExists = (...segments: string[]): boolean =>
  fs.existsSync(path.join(...segments));

const detectClient = (client: SupportedClient): boolean => {
  const home = os.homedir();
  switch (client) {
    case "claude":
      return hasCommand("claude") || dirExists(home, ".claude");
    case "codex":
      return hasCommand("codex") || dirExists(home, ".codex");
    case "cursor":
      return dirExists(home, ".cursor") || dirExists("/Applications/Cursor.app");
    case "windsurf":
      return dirExists(home, ".codeium") || dirExists("/Applications/Windsurf.app");
    case "vscode":
      return hasCommand("code") || dirExists(home, ".vscode") || dirExists("/Applications/Visual Studio Code.app");
    case "gemini":
      return hasCommand("gemini") || dirExists(home, ".gemini");
    case "kiro":
      return dirExists(home, ".kiro") || dirExists("/Applications/Kiro.app");
    case "cline":
      return dirExists(home, ".cline");
    case "continue":
      return dirExists(home, ".continue");
    case "zed":
      return dirExists(home, ".config", "zed") || dirExists("/Applications/Zed.app");
    case "jetbrains":
      return (
        dirExists(home, "Library", "Application Support", "JetBrains") ||
        dirExists(home, ".config", "JetBrains")
      );
  }
};

const clientNextSteps: Partial<Record<SupportedClient, string>> = {
  cursor: "Reload MCP servers in Cursor: Cmd+Shift+P → MCP: Reload Servers",
  windsurf: "Restart Windsurf to load the MCP server",
  vscode: "Open Command Palette → MCP: List Servers to verify",
  gemini: "Restart your Gemini CLI session",
  kiro: "Restart Kiro to load the MCP config",
  cline: "Reload the Cline extension to pick up the MCP config",
  continue: "Reload the Continue extension to pick up the MCP config",
  zed: "Restart Zed to load the MCP server",
  jetbrains: "Add MCP server manually: Settings → AI Assistant → Model Context Protocol → Add",
};

const cancelIfNeeded = (value: unknown): void => {
  if (p.isCancel(value)) {
    p.cancel("Install cancelled.");
    process.exit(0);
  }
};

const printPlan = (plan: InstallPlan): void => {
  const lines: string[] = [
    `${pc.bold("Clients:")} ${plan.clients.join(", ")}`,
    `${pc.bold("Scope:")} ${plan.scope}`,
    `${pc.bold("Database:")} ${plan.dbPath}`,
  ];

  if (plan.globalInstallRequested) {
    lines.push(`${pc.bold("Global install:")} npm install -g knowit`);
  }
  if (plan.useNpxForMcp) {
    lines.push(`${pc.bold("MCP command:")} npx -y knowit@latest serve`);
  }
  if (plan.instructionTargets.length > 0) {
    lines.push(pc.bold("Instruction files:"));
    for (const target of plan.instructionTargets) {
      lines.push(`  ${pc.dim(target.client + ":")} ${target.path}`);
    }
  }
  if (plan.projectMcpConfigPath) {
    lines.push(`${pc.bold("Project MCP config:")} ${plan.projectMcpConfigPath}`);
  }
  if (plan.mcpConfigTargets.length > 0) {
    lines.push(pc.bold("Client MCP configs:"));
    for (const target of plan.mcpConfigTargets) {
      lines.push(`  ${pc.dim(target.client + ":")} ${target.path}`);
    }
  }
  if (plan.mcpRegistrations.length > 0) {
    lines.push(pc.bold("MCP registrations:"));
    for (const registration of plan.mcpRegistrations) {
      lines.push(`  ${pc.dim(registration.client + ":")} ${formatCommand(registration.command, registration.args)}`);
    }
  }
  if (plan.markdownImports.length > 0) {
    lines.push(pc.bold("Markdown imports:"));
    for (const markdownFile of plan.markdownImports) {
      lines.push(`  ${path.relative(process.cwd(), markdownFile.path)} ${pc.dim("→")} ${markdownFile.title} ${pc.dim("(" + markdownFile.type + ")")}`);
    }
  }
  if (plan.warnings.length > 0) {
    lines.push(pc.yellow(pc.bold("Warnings:")));
    for (const warning of plan.warnings) {
      lines.push(`  ${pc.yellow("⚠")} ${warning}`);
    }
  }

  const nextStepClients = plan.clients.filter((c) => clientNextSteps[c]);
  if (nextStepClients.length > 0) {
    lines.push(pc.bold("Next steps:"));
    for (const client of nextStepClients) {
      lines.push(`  ${pc.dim(client + ":")} ${clientNextSteps[client]}`);
    }
  }

  p.note(lines.join("\n"), "Install plan");
};

const buildSelections = async (options: InstallOptions): Promise<InstallSelections> => {
  const cwd = process.cwd();
  const repo = path.basename(cwd);
  const predefinedClients = parseClients(options.client);
  const predefinedScope = parseScope(options.scope);
  const predefinedSource = parseSource(options.source);
  const markdownPaths = (options.markdownPath ?? []).map((filePath) => path.resolve(cwd, filePath));

  const globallyInstalled = isGloballyInstalled();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (!predefinedClients || !predefinedScope) {
      throw new Error("install requires --client and --scope when not running in an interactive terminal.");
    }

    return {
      clients: predefinedClients,
      scope: predefinedScope,
      sourceProvider: predefinedSource ?? "local",
      mcpServerName: options.mcpServerName,
      migrateMarkdown: Boolean(options.migrateMd),
      markdownPaths: options.migrateMd ? (markdownPaths.length > 0 ? markdownPaths : detectMarkdownCandidates(cwd)) : [],
      repo,
      cwd,
      installGlobally: false,
      useNpxForMcp: !globallyInstalled,
    };
  }

  p.intro(pc.bgCyan(pc.black(" Knowit installer ")));

  const allClients: SupportedClient[] = [
    "claude", "codex", "cursor", "windsurf", "vscode", "gemini",
    "kiro", "cline", "continue", "zed", "jetbrains",
  ];
  const detectedClients = new Set(allClients.filter(detectClient));
  const hint = (c: SupportedClient) => detectedClients.has(c) ? "detected" : "not found";
  const commonClients: SupportedClient[] = ["claude", "codex", "cursor"];

  const clientChoice =
    predefinedClients ??
    (await p.multiselect<SupportedClient>({
      message: "Which clients do you want to install into?",
      options: [
        { value: "claude", label: "Claude Code", hint: hint("claude") },
        { value: "codex", label: "Codex", hint: hint("codex") },
        { value: "cursor", label: "Cursor", hint: hint("cursor") },
        { value: "windsurf", label: "Windsurf", hint: hint("windsurf") },
        { value: "vscode", label: "VS Code / GitHub Copilot", hint: hint("vscode") },
        { value: "gemini", label: "Gemini CLI", hint: hint("gemini") },
        { value: "kiro", label: "Kiro", hint: hint("kiro") },
        { value: "cline", label: "Cline", hint: hint("cline") },
        { value: "continue", label: "Continue", hint: hint("continue") },
        { value: "zed", label: "Zed", hint: hint("zed") },
        { value: "jetbrains", label: "JetBrains AI Assistant", hint: hint("jetbrains") },
      ],
      initialValues: commonClients.filter((c) => detectedClients.has(c)),
      required: true,
    }) as SupportedClient[]);
  cancelIfNeeded(clientChoice);

  const scopeChoice =
    predefinedScope ??
    await p.select<InstallScope>({
      message: "Where should the install apply?",
      options: [
        { value: "project", label: "Project only", hint: "writes to this repo" },
        { value: "global", label: "Global / user-wide", hint: "applies across all projects" },
      ],
    });
  cancelIfNeeded(scopeChoice);

  let installGlobally = false;
  if (!globallyInstalled) {
    const globalAnswer = await p.confirm({
      message: "Install knowit globally? (faster MCP startup; skip to use npx instead)",
      initialValue: true,
    });
    cancelIfNeeded(globalAnswer);
    installGlobally = globalAnswer as boolean;
  }

  let mcpServerName = options.mcpServerName;
  const sourceProvider = predefinedSource ?? "local";
  if (!mcpServerName && sourceProvider === "notion") {
    const notionName = await p.text({
      message: "Notion MCP server name:",
      placeholder: "notion",
      defaultValue: "notion",
    });
    cancelIfNeeded(notionName);
    mcpServerName = (notionName as string) || "notion";
  }

  let migrateMarkdown = Boolean(options.migrateMd);
  let resolvedMarkdownPaths = markdownPaths;

  if (!options.migrateMd) {
    const detected = detectMarkdownCandidates(cwd);
    if (detected.length > 0) {
      const dbPath =
        (scopeChoice as InstallScope) === "global"
          ? path.join(os.homedir(), ".knowit", "knowit.db")
          : path.join(cwd, ".knowit", "knowit.db");
      const isReinstall = fs.existsSync(dbPath);
      const migrateAnswer = await p.confirm({
        message: isReinstall
          ? `Refresh ${detected.length} knowledge file${detected.length === 1 ? "" : "s"} in Knowit? (already imported — will update any that changed)`
          : `Import ${detected.length} existing markdown knowledge file${detected.length === 1 ? "" : "s"} into Knowit?`,
        initialValue: true,
      });
      cancelIfNeeded(migrateAnswer);
      migrateMarkdown = migrateAnswer as boolean;
      resolvedMarkdownPaths = migrateMarkdown ? detected : [];
    } else {
      migrateMarkdown = false;
      resolvedMarkdownPaths = [];
    }
  } else if (resolvedMarkdownPaths.length === 0) {
    resolvedMarkdownPaths = detectMarkdownCandidates(cwd);
  }

  return {
    clients: clientChoice,
    scope: scopeChoice as InstallScope,
    sourceProvider,
    mcpServerName,
    migrateMarkdown,
    markdownPaths: resolvedMarkdownPaths,
    repo,
    cwd,
    installGlobally,
    useNpxForMcp: !globallyInstalled && !installGlobally,
  };
};

export const installCommand = async (options: InstallOptions): Promise<void> => {
  const selections = await buildSelections(options);
  const plan = createInstallPlan(selections);

  printPlan(plan);

  if (options.dryRun) {
    p.outro(pc.dim("Dry run only. No changes applied."));
    return;
  }

  if (!options.yes && process.stdin.isTTY && process.stdout.isTTY) {
    const confirmed = await p.confirm({ message: "Apply this install plan?", initialValue: true });
    cancelIfNeeded(confirmed);
    if (!confirmed) {
      p.cancel("Install cancelled.");
      return;
    }
  }

  const result = await applyInstallPlan(plan, { cwd: selections.cwd });

  const summary: string[] = [];

  if (result.globalInstallSucceeded === true) {
    summary.push(pc.green("✓") + " knowit installed globally");
  } else if (result.globalInstallSucceeded === false) {
    summary.push(
      pc.yellow("⚠") + " Global install failed — run " + pc.bold("npm install -g knowit") + " manually before starting your agent",
    );
  }

  summary.push(`${pc.green("✓")} Installed for ${pc.bold(result.plan.clients.join(", "))}`);
  summary.push(`${pc.bold("Database:")} ${result.plan.dbPath}`);

  if (result.registrationOutcomes.length > 0) {
    for (const outcome of result.registrationOutcomes) {
      if (outcome.succeeded) {
        summary.push(`${pc.green("✓")} ${outcome.client}: MCP registered`);
      } else {
        summary.push(`${pc.red("✗")} ${outcome.client}: MCP registration failed`);
        summary.push(`  Run manually: ${outcome.command}`);
      }
    }
  }

  if (result.instructionPaths.length > 0) {
    summary.push(pc.bold("Instructions written to:"));
    for (const instructionPath of result.instructionPaths) {
      summary.push(`  ${instructionPath}`);
    }
  }

  if (result.importedEntryCount > 0) {
    summary.push(`${pc.green("✓")} Imported ${result.importedEntryCount} markdown files`);
  }

  p.outro(summary.join("\n"));
};
