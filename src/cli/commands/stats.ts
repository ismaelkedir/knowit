import { MemoryService } from "../../services/memoryService.js";

interface StatsCommandOptions {
  source?: string;
  repo?: string;
  domain?: string;
  limit?: string;
}

const formatCounts = (counts: Record<string, number>): string[] =>
  Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => `  ${key}: ${value}`);

export const statsCommand = async (options: StatsCommandOptions): Promise<void> => {
  const service = new MemoryService();
  service.init();
  const stats = await service.getKnowledgeStats({
    source: options.source ?? "local",
    repo: options.repo,
    domain: options.domain,
    limit: options.limit ? Number(options.limit) : 100,
  });

  console.log(`Total entries: ${stats.totalEntries}`);
  console.log("");
  console.log("By type:");
  console.log(formatCounts(stats.byType).join("\n") || "  none");
  console.log("");
  console.log("By repo:");
  console.log(formatCounts(stats.byRepo).join("\n") || "  none");
  console.log("");
  console.log("By domain:");
  console.log(formatCounts(stats.byDomain).join("\n") || "  none");
  console.log("");
  console.log("Recent entries:");
  if (stats.recentEntries.length === 0) {
    console.log("  none");
    return;
  }

  for (const entry of stats.recentEntries) {
    console.log(`  ${entry.id} | ${entry.type} | ${entry.updatedAt} | ${entry.title}`);
  }
};
