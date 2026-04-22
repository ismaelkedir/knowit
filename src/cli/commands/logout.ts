import { MemoryService } from "../../services/memoryService.js";
import { Command } from "commander";
import { clearCredentials, loadCredentials } from "../../utils/credentials.js";

interface RegisterLogoutCommandOptions {
  hidden?: boolean;
  name?: string;
}

export function registerLogoutCommand(program: Command, options: RegisterLogoutCommandOptions = {}): void {
  program
    .command(options.name ?? "logout", { hidden: options.hidden ?? false })
    .description("Disconnect from Knowit Cloud and return to local storage")
    .action(async () => {
      const creds = loadCredentials();
      if (!creds) {
        console.log("Not currently logged in to Knowit Cloud.");
        return;
      }

      clearCredentials();

      const service = new MemoryService();
      service.disconnectCloudSource();

      // Remove KNOWIT_CLOUD_TOKEN from Claude config if present
      try {
        await removeMcpToken();
      } catch {
        // Non-fatal
      }

      console.log("Logged out from Knowit Cloud.");
      console.log("Your default source is now local SQLite.");
    });
}

async function removeMcpToken(): Promise<void> {
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs");

  const claudeConfigPath = path.join(os.homedir(), ".claude", "settings.json");
  if (!fs.existsSync(claudeConfigPath)) return;

  const raw = fs.readFileSync(claudeConfigPath, "utf8");
  const config = JSON.parse(raw) as Record<string, unknown>;
  const mcpServers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
  const knowit = mcpServers["knowit"] as Record<string, unknown> | undefined;
  if (!knowit) return;

  const env = (knowit.env as Record<string, string> | undefined) ?? {};
  delete env["KNOWIT_CLOUD_TOKEN"];
  knowit.env = env;
  mcpServers["knowit"] = knowit;
  config.mcpServers = mcpServers;

  fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2), "utf8");
  console.log("✓ Removed cloud token from Claude Code MCP config");
}
