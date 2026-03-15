import { MemoryService } from "../../services/memoryService.js";

interface SearchCommandOptions {
  source?: string;
  repo?: string;
  domain?: string;
  limit?: string;
}

export const searchCommand = async (
  query: string,
  options: SearchCommandOptions,
): Promise<void> => {
  const service = new MemoryService();
  service.init();
  const results = await service.searchKnowledge({
    query,
    source: options.source,
    repo: options.repo,
    domain: options.domain,
    limit: options.limit ? Number(options.limit) : 5,
  });

  if (results.length === 0) {
    console.log("No knowledge entries found.");
    return;
  }

  for (const result of results) {
    console.log(`[${result.type}] ${result.title}`);
    console.log(
      `score=${result.score.toFixed(4)} source=${result.sourceId} scope=${result.scope} repo=${result.repo ?? "-"} domain=${result.domain ?? "-"}`,
    );
    console.log(result.content);
    console.log("");
  }
};
