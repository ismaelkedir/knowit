import { Command } from "commander";
import { loadCredentials } from "../../utils/credentials.js";

export function registerWhoamiCommand(program: Command): void {
  program
    .command("whoami")
    .description("Show the currently logged-in cloud account")
    .action(async () => {
      const envToken = process.env.KNOWIT_CLOUD_TOKEN;
      const creds = loadCredentials();
      const token = envToken ?? creds?.token;

      if (!token) {
        console.log("Not logged in to Knowit Cloud.");
        console.log("Run: knowit login --token <your-token>");
        return;
      }

      const apiUrl = process.env.KNOWIT_CLOUD_API_URL ?? creds?.cloudApiUrl ?? "https://www.useknowit.dev";

      try {
        const res = await fetch(`${apiUrl}/api/trpc/auth.me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text}`);
        }

        const data = (await res.json()) as {
          result?: { data?: { json?: { email: string; plan: string } } };
          error?: { message: string };
        };

        if (data.error) throw new Error(data.error.message);
        const me = data.result?.data?.json;
        if (!me) throw new Error("No account data returned");

        console.log(`Logged in as: ${me.email}`);
        console.log(`Plan:         ${me.plan}`);
        console.log(`API URL:      ${apiUrl}`);
        if (envToken) {
          console.log("Token source: KNOWIT_CLOUD_TOKEN env var");
        } else {
          console.log(`Token source: ~/.knowit/credentials.json`);
        }
      } catch (err) {
        console.error(`Error: Could not reach Knowit Cloud — ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
