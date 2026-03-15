import { MemoryService } from "../../services/memoryService.js";
import { knowledgeTypeSchema } from "../../types/knowledge.js";

interface ListCommandOptions {
  source?: string;
  type?: string;
  repo?: string;
  domain?: string;
  limit?: string;
}

export const listCommand = async (options: ListCommandOptions): Promise<void> => {
  const service = new MemoryService();
  service.init();
  const type = options.type ? knowledgeTypeSchema.parse(options.type) : undefined;
  const entries = await service.listKnowledge({
    source: options.source,
    type,
    repo: options.repo,
    domain: options.domain,
    limit: options.limit ? Number(options.limit) : 50,
  });

  if (entries.length === 0) {
    console.log("No knowledge entries found.");
    return;
  }

  for (const entry of entries) {
    const preview =
      entry.content.length > 96 ? `${entry.content.slice(0, 93).trimEnd()}...` : entry.content;
    console.log(`${entry.id} | ${entry.type} | ${entry.scope} | ${entry.title}`);
    console.log(`  repo=${entry.repo ?? "-"} domain=${entry.domain ?? "-"} tags=${entry.tags.join(",") || "-"}`);
    console.log(`  ${preview}`);
  }
};
