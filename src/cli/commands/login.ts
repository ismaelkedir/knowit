import { Command } from "commander";
import { getStorageScope } from "../../db/database.js";
import { MemoryService } from "../../services/memoryService.js";
import { saveCredentials } from "../../utils/credentials.js";
import { KNOWIT_CLOUD_DISABLED_MESSAGE, isKnowitCloudEnabled } from "../../utils/cloudAvailability.js";

const DEFAULT_CLOUD_API_URL = "https://www.useknowit.dev";

interface LoginOptions {
  token?: string;
  apiUrl?: string;
  defaultSource?: string;
}

const describeStorageScope = (): string => {
  const storageScope = getStorageScope();
  if (storageScope === "project" || storageScope === "global") {
    return storageScope;
  }

  return "custom";
};

const resolveDefaultToCloud = async (options: LoginOptions): Promise<boolean> => {
  if (options.defaultSource) {
    if (options.defaultSource === "cloud") {
      return true;
    }

    if (options.defaultSource === "keep" || options.defaultSource === "local") {
      return false;
    }

    throw new Error("default-source must be one of: keep, local, cloud");
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const scopeLabel = describeStorageScope();
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = (
      await rl.question(`Make Knowit Cloud the default source for this ${scopeLabel} setup? [y/N] `)
    )
      .trim()
      .toLowerCase();

    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
};

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Connect the Knowit CLI to your cloud account")
    .option("--token <token>", "Your Knowit Cloud API token (ki_live_...)")
    .option("--api-url <url>", "Cloud API URL (default: https://www.useknowit.dev)")
    .option("--default-source <defaultSource>", "Default source after login: keep, local, or cloud")
    .action(async (options: LoginOptions) => {
      if (!isKnowitCloudEnabled()) {
        console.error(`Error: ${KNOWIT_CLOUD_DISABLED_MESSAGE}`);
        process.exit(1);
      }

      const token = options.token ?? process.env.KNOWIT_CLOUD_TOKEN;
      const apiUrl = options.apiUrl ?? process.env.KNOWIT_CLOUD_API_URL ?? DEFAULT_CLOUD_API_URL;

      if (!token) {
        console.error("Error: --token is required. Get a token at https://www.useknowit.dev/dashboard/tokens");
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

      const defaultToCloud = await resolveDefaultToCloud(options);

      // Save credentials
      saveCredentials({
        token,
        accountId,
        plan: plan as "pro" | "team",
        cloudApiUrl: apiUrl,
        defaultToCloud,
      });

      // Patch MCP client configs to inject KNOWIT_CLOUD_TOKEN
      try {
        await patchMcpConfigs(token);
      } catch {
        // Non-fatal — credentials file will be picked up as fallback
      }

      const service = new MemoryService();
      service.init();
      if (defaultToCloud) {
        service.setDefaultSource("cloud");
      } else {
        service.setDefaultSource("local");
      }

      console.log(`\nLogged in as ${email} (${plan} plan)`);
      if (defaultToCloud) {
        console.log(`Knowit Cloud is now the default source for this ${describeStorageScope()} setup.`);
      } else {
        console.log("Knowit Cloud is available as an optional source. Your default source remains local.");
      }
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
  knowit.env = env;
  mcpServers["knowit"] = knowit;
  config.mcpServers = mcpServers;

  fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2), "utf8");
  console.log("✓ Updated Claude Code MCP config with cloud token");
}
