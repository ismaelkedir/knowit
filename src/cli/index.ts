#!/usr/bin/env node
import { Command } from "commander";
import dotenv from "dotenv";
import { addCommand } from "./commands/add.js";
import { installCommand } from "./commands/install.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { resolveCommand } from "./commands/resolve.js";
import { searchCommand } from "./commands/search.js";
import { showCommand } from "./commands/show.js";
import { statsCommand } from "./commands/stats.js";
import { sourceAddMcpCommand } from "./commands/sourceAddMcp.js";
import { sourceConnectCommand } from "./commands/sourceConnect.js";
import { sourceListCommand } from "./commands/sourceList.js";
import { sourceShowCommand } from "./commands/sourceShow.js";
import { importMdCommand } from "./commands/importMd.js";
import { migrateCommand } from "./commands/migrate.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { registerWhoamiCommand } from "./commands/whoami.js";
import { startMcpServer } from "../server/mcpServer.js";

dotenv.config();

const program = new Command();

program
  .name("knowit")
  .description("Shared team memory for AI coding agents")
  .version("0.2.3");

program
  .command("serve")
  .description("Start the Knowit MCP server over stdio")
  .action(async () => {
    await startMcpServer();
  });

program
  .command("install")
  .description("Install Knowit into AI clients and initialize storage if needed")
  .option("--client <client>", "Target client: claude, codex, or both")
  .option("--scope <scope>", "Install scope: project or global")
  .option("--source <source>", "Preferred source: local or notion")
  .option("--mcp-server-name <mcpServerName>", "Downstream MCP server name for routed sources like notion")
  .option("--migrate-md", "Import detected markdown knowledge files into Knowit")
  .option("--markdown-path <markdownPath...>", "Specific markdown files to import")
  .option("--yes", "Apply without a confirmation prompt")
  .option("--dry-run", "Preview the install plan without applying it")
  .action(installCommand);

program
  .command("init")
  .description("Initialize the SQLite database manually")
  .action(initCommand);

program
  .command("add")
  .description("Add a knowledge entry")
  .argument("<type>", "Knowledge type")
  .argument("<title>", "Entry title")
  .argument("<content>", "Entry content")
  .option("--source <source>", "Target source ID")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--repo <repo>", "Repository identifier")
  .option("--domain <domain>", "Knowledge domain")
  .option("--scope <scope>", "Knowledge scope", "global")
  .option("--confidence <confidence>", "Confidence between 0 and 1", "1")
  .option("--url <url>", "Canonical source URL")
  .action(addCommand);

program
  .command("search")
  .description("Search for relevant knowledge entries")
  .argument("<query>", "Search query")
  .option("--source <source>", "Search a specific source only")
  .option("--repo <repo>", "Repository identifier")
  .option("--domain <domain>", "Knowledge domain")
  .option("--limit <limit>", "Maximum results", "5")
  .action(searchCommand);

program
  .command("list")
  .description("List knowledge entries")
  .option("--source <source>", "List entries from a specific source", "local")
  .option("--type <type>", "Filter by knowledge type")
  .option("--repo <repo>", "Filter by repository")
  .option("--domain <domain>", "Filter by domain")
  .option("--limit <limit>", "Maximum results", "50")
  .action(listCommand);

program
  .command("show")
  .description("Show a single knowledge entry")
  .argument("<id>", "Knowledge entry ID")
  .option("--source <source>", "Read from a specific source", "local")
  .action(showCommand);

program
  .command("stats")
  .description("Summarize knowledge entries")
  .option("--source <source>", "Inspect a specific source", "local")
  .option("--repo <repo>", "Filter by repository")
  .option("--domain <domain>", "Filter by domain")
  .option("--limit <limit>", "Maximum entries to inspect", "100")
  .action(statsCommand);

program
  .command("resolve")
  .description("Resolve context for a task")
  .argument("<task>", "Task description")
  .option("--source <source>", "Resolve against a specific source only")
  .option("--repo <repo>", "Repository identifier")
  .option("--domain <domain>", "Knowledge domain")
  .option("--files <files>", "Comma-separated file paths")
  .option("--limit <limit>", "Maximum results", "5")
  .action(resolveCommand);

const sourceProgram = program.command("source").description("Manage Knowit sources");

sourceProgram
  .command("list")
  .description("List configured sources")
  .action(sourceListCommand);

sourceProgram
  .command("show")
  .description("Show one configured source")
  .argument("<id>", "Source ID")
  .action(sourceShowCommand);

sourceProgram
  .command("connect")
  .description("Connect a known source provider")
  .argument("<provider>", "Known provider: local or notion")
  .option("--mcp-server-name <mcpServerName>", "Known MCP server name for the provider")
  .option("--default", "Mark this source as the default")
  .action(sourceConnectCommand);

sourceProgram
  .command("add-mcp")
  .description("Register a custom external MCP source (advanced)")
  .argument("<name>", "Source name")
  .argument("<command>", "Command used to start the external MCP server")
  .option("--args <args>", "Comma-separated command arguments")
  .option("--cwd <cwd>", "Working directory for the external MCP server")
  .option("--env <env>", "Comma-separated KEY=VALUE pairs")
  .option("--store-tool <storeTool>", "Remote tool name used to store knowledge")
  .option("--search-tool <searchTool>", "Remote tool name used to search knowledge")
  .option("--resolve-tool <resolveTool>", "Remote tool name used to resolve context")
  .option("--default", "Mark this source as the default")
  .action(sourceAddMcpCommand);

program
  .command("import-md")
  .description("Import markdown knowledge files into a Knowit source")
  .option("--source <source>", "Target source ID", "local")
  .option("--path <path...>", "Specific markdown files to import (auto-detects if omitted)")
  .option("--repo <repo>", "Repository name to tag entries with (defaults to current directory name)")
  .option("--yes", "Skip confirmation prompt")
  .option("--dry-run", "Preview files without importing")
  .action(importMdCommand);

program
  .command("migrate")
  .description("Migrate knowledge entries from one source to another")
  .option("--from <source>", "Source to migrate from", "local")
  .option("--to <source>", "Destination source to migrate to", "cloud")
  .option("--yes", "Skip confirmation prompt")
  .option("--dry-run", "Preview entries without migrating")
  .action(migrateCommand);

registerLoginCommand(program);
registerLogoutCommand(program);
registerWhoamiCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(message);
  process.exitCode = 1;
});
