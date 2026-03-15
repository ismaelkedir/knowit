import { MemoryService } from "../../services/memoryService.js";
import { knowledgeScopeSchema, knowledgeTypeSchema } from "../../types/knowledge.js";

interface AddCommandOptions {
  tags?: string;
  repo?: string;
  domain?: string;
  scope?: string;
  confidence?: string;
  source?: string;
  url?: string;
}

const parseTags = (tags?: string): string[] =>
  (tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export const addCommand = async (
  type: string,
  title: string,
  content: string,
  options: AddCommandOptions,
): Promise<void> => {
  const service = new MemoryService();
  service.init();

  const parsedType = knowledgeTypeSchema.parse(type);
  const scope = knowledgeScopeSchema.parse(options.scope ?? "global");
  const tags = parseTags(options.tags);
  const entry = await service.storeKnowledge({
    source: options.source,
    type: parsedType,
    title,
    content,
    scope,
    repo: options.repo ?? null,
    domain: options.domain ?? null,
    tags,
    confidence: options.confidence ? Number(options.confidence) : 1,
    url: options.url ?? null,
    metadata: {},
  });

  console.log(`Stored knowledge entry ${entry.id} (${entry.type}: ${entry.title})`);
};
