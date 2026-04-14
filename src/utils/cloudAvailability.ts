export function isKnowitCloudEnabled(): boolean {
  return process.env.KNOWIT_CLOUD_ENABLED === "true";
}

export const KNOWIT_CLOUD_DISABLED_MESSAGE =
  "Knowit Cloud is not publicly available yet. The current public release is local-first and open source only.";
