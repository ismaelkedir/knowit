import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
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

const askChoice = async <T extends string>(
  rl: readline.Interface,
  prompt: string,
  options: Array<{ label: string; value: T }>,
): Promise<T> => {
  while (true) {
    output.write(`${prompt}\n`);
    options.forEach((option, index) => {
      output.write(`  ${index + 1}. ${option.label}\n`);
    });

    const answer = (await rl.question("> ")).trim();
    const numericIndex = Number(answer);

    if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= options.length) {
      return options[numericIndex - 1]!.value;
    }

    const directMatch = options.find((option) => option.value === answer);
    if (directMatch) {
      return directMatch.value;
    }

    output.write("Invalid selection. Try again.\n\n");
  }
};

const askYesNo = async (rl: readline.Interface, prompt: string, defaultValue: boolean): Promise<boolean> => {
  const suffix = defaultValue ? " [Y/n] " : " [y/N] ";

  while (true) {
    const answer = (await rl.question(`${prompt}${suffix}`)).trim().toLowerCase();
    if (!answer) {
      return defaultValue;
    }
    if (answer === "y" || answer === "yes") {
      return true;
    }
    if (answer === "n" || answer === "no") {
      return false;
    }
  }
};

const printPlan = (plan: InstallPlan): void => {
  output.write("\nInstall plan\n");
  output.write(`- Clients: ${plan.clients.join(", ")}\n`);
  output.write(`- Scope: ${plan.scope}\n`);
  output.write(`- Preferred source: ${plan.sourceProvider}\n`);
  output.write(`- Database path: ${plan.dbPath}\n`);
  if (plan.globalInstallRequested) {
    output.write("- Global install: npm install -g knowit\n");
  }
  if (plan.useNpxForMcp) {
    output.write("- MCP server command: npx -y knowit@latest serve\n");
  }

  if (plan.instructionTargets.length > 0) {
    output.write("- Instruction files:\n");
    for (const target of plan.instructionTargets) {
      output.write(`  - ${target.client}: ${target.path}\n`);
    }
  }

  if (plan.projectMcpConfigPath) {
    output.write(`- Project MCP config: ${plan.projectMcpConfigPath}\n`);
  }

  if (plan.mcpConfigTargets.length > 0) {
    output.write("- Client MCP config files:\n");
    for (const target of plan.mcpConfigTargets) {
      output.write(`  - ${target.client}: ${target.path}\n`);
    }
  }

  if (plan.mcpRegistrations.length > 0) {
    output.write("- MCP registration commands:\n");
    for (const registration of plan.mcpRegistrations) {
      output.write(`  - ${registration.client}: ${formatCommand(registration.command, registration.args)}\n`);
    }
  }

  if (plan.markdownImports.length > 0) {
    output.write("- Markdown imports:\n");
    for (const markdownFile of plan.markdownImports) {
      output.write(`  - ${path.relative(process.cwd(), markdownFile.path)} -> ${markdownFile.title} (${markdownFile.type})\n`);
    }
  }

  if (plan.warnings.length > 0) {
    output.write("- Warnings:\n");
    for (const warning of plan.warnings) {
      output.write(`  - ${warning}\n`);
    }
  }
  output.write("\n");
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
    if (!predefinedClients || !predefinedScope || !predefinedSource) {
      throw new Error("install requires --client, --scope, and --source when not running in an interactive terminal.");
    }

    return {
      clients: predefinedClients,
      scope: predefinedScope,
      sourceProvider: predefinedSource,
      mcpServerName: options.mcpServerName,
      migrateMarkdown: Boolean(options.migrateMd),
      markdownPaths: options.migrateMd ? (markdownPaths.length > 0 ? markdownPaths : detectMarkdownCandidates(cwd)) : [],
      repo,
      cwd,
      installGlobally: false,
      useNpxForMcp: !globallyInstalled,
    };
  }

  const rl = readline.createInterface({ input, output });

  try {
    const clientChoice =
      predefinedClients ??
      ((await askChoice(rl, "Which client do you want Knowit to install into?", [
        { label: "Claude Code", value: "claude" },
        { label: "Codex", value: "codex" },
        { label: "Both Claude Code and Codex", value: "both" },
        { label: "Cursor", value: "cursor" },
        { label: "Windsurf", value: "windsurf" },
        { label: "VS Code / GitHub Copilot", value: "vscode" },
        { label: "Gemini CLI", value: "gemini" },
        { label: "Kiro", value: "kiro" },
        { label: "Cline", value: "cline" },
        { label: "Continue", value: "continue" },
        { label: "Zed", value: "zed" },
        { label: "JetBrains AI Assistant", value: "jetbrains" },
      ]).then((value) => (value === "both" ? ["claude", "codex"] : [value]))) as SupportedClient[]);

    const scopeChoice =
      predefinedScope ??
      ((await askChoice<InstallScope>(rl, "Where should the install apply?", [
        { label: "Project only", value: "project" },
        { label: "Global / user-wide", value: "global" },
      ])) as InstallScope);

    const sourceChoice =
      predefinedSource ??
      ((await askChoice<KnownSourceProvider>(rl, "Where should Knowit store long-term memory by default?", [
        { label: "Local Knowit storage", value: "local" },
        { label: "Notion (routed through Knowit guidance)", value: "notion" },
      ])) as KnownSourceProvider);

    let installGlobally = false;
    if (!globallyInstalled) {
      installGlobally = await askYesNo(
        rl,
        "Install knowit globally? (faster MCP startup; skip to use npx instead)",
        true,
      );
    }

    let mcpServerName = options.mcpServerName;
    if (!mcpServerName && sourceChoice === "notion") {
      const answer = (await rl.question("What is the Notion MCP server name? [notion] ")).trim();
      mcpServerName = answer || "notion";
    }

    let migrateMarkdown = Boolean(options.migrateMd);
    let resolvedMarkdownPaths = markdownPaths;

    if (!options.migrateMd) {
      const detected = detectMarkdownCandidates(cwd);
      if (detected.length > 0) {
        migrateMarkdown = await askYesNo(
          rl,
          `Import ${detected.length} existing markdown knowledge files into Knowit?`,
          true,
        );
        resolvedMarkdownPaths = migrateMarkdown ? detected : [];
      } else {
        output.write("No importable markdown knowledge files detected. Continuing without migration.\n\n");
        migrateMarkdown = false;
        resolvedMarkdownPaths = [];
      }
    } else if (resolvedMarkdownPaths.length === 0) {
      resolvedMarkdownPaths = detectMarkdownCandidates(cwd);
    }

    return {
      clients: clientChoice,
      scope: scopeChoice,
      sourceProvider: sourceChoice,
      mcpServerName,
      migrateMarkdown,
      markdownPaths: resolvedMarkdownPaths,
      repo,
      cwd,
      installGlobally,
      useNpxForMcp: !globallyInstalled && !installGlobally,
    };
  } finally {
    rl.close();
  }
};

export const installCommand = async (options: InstallOptions): Promise<void> => {
  const selections = await buildSelections(options);
  const plan = createInstallPlan(selections);

  printPlan(plan);

  if (options.dryRun) {
    output.write("Dry run only. No changes applied.\n");
    return;
  }

  if (!options.yes && process.stdin.isTTY && process.stdout.isTTY) {
    const rl = readline.createInterface({ input, output });
    try {
      const confirmed = await askYesNo(rl, "Apply this install plan?", true);
      if (!confirmed) {
        output.write("Install cancelled.\n");
        return;
      }
    } finally {
      rl.close();
    }
  }

  const result = await applyInstallPlan(plan, {
    cwd: selections.cwd,
  });

  if (result.globalInstallSucceeded === true) {
    output.write("knowit installed globally.\n");
  } else if (result.globalInstallSucceeded === false) {
    output.write(
      "Global install failed. MCP config uses `knowit serve` — run `npm install -g knowit` manually before starting your agent.\n",
    );
  }

  output.write(`Knowit installed for ${result.plan.clients.join(", ")}.\n`);
  output.write(`Database: ${result.plan.dbPath}\n`);
  if (result.registrationOutcomes.length > 0) {
    output.write("MCP registration:\n");
    for (const outcome of result.registrationOutcomes) {
      if (outcome.succeeded) {
        output.write(`- ${outcome.client}: installed automatically\n`);
      } else {
        output.write(`- ${outcome.client}: automatic install failed\n`);
        output.write(`  Error: ${outcome.error}\n`);
        output.write(`  Run manually: ${outcome.command}\n`);
      }
    }
  }
  if (result.instructionPaths.length > 0) {
    output.write(`Instruction files updated:\n`);
    for (const instructionPath of result.instructionPaths) {
      output.write(`- ${instructionPath}\n`);
    }
  }
  if (result.importedEntryCount > 0) {
    output.write(`Imported ${result.importedEntryCount} markdown files into Knowit.\n`);
  }
};
