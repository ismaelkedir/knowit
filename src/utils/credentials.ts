import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface KnowitCredentials {
  token: string;
  accountId: string;
  plan: "pro" | "team";
  cloudApiUrl: string;
}

const credentialsPath = path.join(os.homedir(), ".knowit", "credentials.json");

export function loadCredentials(): KnowitCredentials | null {
  try {
    if (!fs.existsSync(credentialsPath)) return null;
    const raw = fs.readFileSync(credentialsPath, "utf8");
    return JSON.parse(raw) as KnowitCredentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: KnowitCredentials): void {
  const dir = path.dirname(credentialsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(credentialsPath, JSON.stringify(creds, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function clearCredentials(): void {
  try {
    if (fs.existsSync(credentialsPath)) {
      fs.unlinkSync(credentialsPath);
    }
  } catch {
    // ignore
  }
}
