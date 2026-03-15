import { MemoryService } from "../../services/memoryService.js";

interface ShowCommandOptions {
  source?: string;
}

export const showCommand = async (id: string, options: ShowCommandOptions): Promise<void> => {
  const service = new MemoryService();
  service.init();
  const entry = await service.getKnowledgeEntry({
    id,
    source: options.source ?? "local",
  });

  if (!entry) {
    console.log(`Knowledge entry not found: ${id}`);
    return;
  }

  console.log(`ID: ${entry.id}`);
  console.log(`Title: ${entry.title}`);
  console.log(`Type: ${entry.type}`);
  console.log(`Scope: ${entry.scope}`);
  console.log(`Repo: ${entry.repo ?? "-"}`);
  console.log(`Domain: ${entry.domain ?? "-"}`);
  console.log(`Tags: ${entry.tags.length > 0 ? entry.tags.join(", ") : "-"}`);
  console.log(`Confidence: ${entry.confidence}`);
  console.log(`Updated: ${entry.updatedAt}`);
  console.log(`URL: ${entry.url ?? "-"}`);
  console.log("");
  console.log(entry.content);
};
