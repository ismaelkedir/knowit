import { Command } from "commander";
import { saveCredentials } from "../../utils/credentials.js";
import { applyInstallPlan, createInstallPlan } from "../../install/installer.js";

const DEFAULT_CLOUD_API_URL = "https://useknowit.dev";

interface LoginOptions {
  token?: string;
  apiUrl?: string;
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Connect the Knowit CLI to your cloud account")
    .option("--token <token>", "Your Knowit Cloud API token (ki_live_...)")
    .option("--api-url <url>", "Cloud API URL (default: https://useknowit.dev)")
    .action(async (options: LoginOptions) => {
      const token = options.token ?? process.env.KNOWIT_CLOUD_TOKEN;
      const apiUrl = options.apiUrl ?? process.env.KNOWIT_CLOUD_API_URL ?? DEFAULT_CLOUD_API_URL;

      if (!token) {
        console.error("Error: --token is required. Get a token at https://useknowit.dev/dashboard/tokens");
        process.exit(1);
      }

      if (!token.startsWith("ki_live_")) {
        console.error("Error: Invalid token format. Tokens start with ki_live_");
        process.exit(1);
      }

      console.log("Validating token...");

      // Validate against the Cloud API
      let accountId: string;
      let plan: string;
      let email: string;

      try {
        const res = await fetch(`${apiUrl}/api/trpc/auth.validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: { token } }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          result?: { data?: { json?: { valid: boolean; accountId: string; plan: string; email: string } } };
          error?: { message: string };
        };

        if (data.error) throw new Error(data.error.message);
        const result = data.result?.data?.json;
        if (!result?.valid) throw new Error("Token validation failed");

        accountId = result.accountId;
        plan = result.plan;
        email = result.email;
      } catch (err) {
        console.error(`Error: Could not validate token — ${(err as Error).message}`);
        process.exit(1);
      }

      // Save credentials
      saveCredentials({
        token,
        accountId,
        plan: plan as "pro" | "team",
        cloudApiUrl: apiUrl,
      });

      // Patch MCP client configs to inject KNOWIT_CLOUD_TOKEN
      try {
        await patchMcpConfigs(token);
      } catch {
        // Non-fatal — credentials file will be picked up as fallback
      }

      console.log(`\nLogged in as ${email} (${plan} plan)`);
      console.log("Your agent sessions will now read and write to Knowit Cloud.");
      console.log("\nTo verify: knowit whoami");
    });
}

async function patchMcpConfigs(token: string): Promise<void> {
  // Patch claude user-scoped config if it exists
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
  env["KNOWIT_CLOUD_TOKEN"] = token;
  // Remove local DB env if switching to cloud
  delete env["KNOWIT_DB_PATH"];
  knowit.env = env;
  mcpServers["knowit"] = knowit;
  config.mcpServers = mcpServers;

  fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2), "utf8");
  console.log("✓ Updated Claude Code MCP config with cloud token");
}
