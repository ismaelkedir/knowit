import { MemoryService } from "../../services/memoryService.js";

interface ResolveCommandOptions {
  source?: string;
  repo?: string;
  domain?: string;
  files?: string;
  limit?: string;
}

const parseFiles = (files?: string): string[] =>
  (files ?? "")
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean);

export const resolveCommand = async (
  task: string,
  options: ResolveCommandOptions,
): Promise<void> => {
  const service = new MemoryService();
  service.init();
  const results = await service.resolveContext({
    task,
    source: options.source,
    repo: options.repo,
    domain: options.domain,
    files: parseFiles(options.files),
    limit: options.limit ? Number(options.limit) : 5,
  });

  if (results.length === 0) {
    console.log("No relevant knowledge found.");
    return;
  }

  for (const result of results) {
    console.log(`[${result.score.toFixed(4)}] ${result.title} (${result.type})`);
    console.log(
      `source=${result.sourceId} scope=${result.scope} repo=${result.repo ?? "-"} domain=${result.domain ?? "-"}`,
    );
    console.log(result.content);
    console.log("");
  }
};
