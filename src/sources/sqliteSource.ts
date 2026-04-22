import { KnowledgeRepository } from "../db/knowledgeRepo.js";
import { buildEmbeddingInput, generateEmbedding } from "../search/embeddings.js";
import type {
  KnowledgeEntry,
  KnowledgeListFilters,
  KnowledgeResult,
  ResolveContextInput,
  StoreKnowledgeInput,
} from "../types/knowledge.js";
import type { KnowledgeSource } from "../types/source.js";
import type { MemorySourceProvider } from "./base.js";
import { logger } from "../utils/logger.js";

type EmbeddingGenerator = (text: string) => Promise<number[]>;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetryableEmbeddingError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("openai_api_key is required")) {
    return false;
  }

  return true;
};

const isMissingApiKeyError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("openai_api_key is required");
};

const tryGenerateEmbedding = async (
  embeddingGenerator: EmbeddingGenerator,
  text: string,
  purpose: "store" | "search" | "resolve",
): Promise<number[] | null> => {
  const maxAttempts = 2;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsMade = attempt;
    try {
      return await embeddingGenerator(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown embedding error";
      if (attempt < maxAttempts && isRetryableEmbeddingError(error)) {
        logger.warn(`Embedding generation failed on attempt ${attempt}; retrying`, {
          purpose,
          attempt,
          error: message,
        });
        await sleep(100 * 2 ** (attempt - 1));
        continue;
      }

      const meta = {
        purpose,
        attempts: attemptsMade,
        error: message,
      };

      if (isMissingApiKeyError(error)) {
        logger.debug("Embedding generation unavailable; using non-embedding path", meta);
      } else {
        logger.warn("Embedding generation failed; falling back to non-embedding path", meta);
      }
    }
  }

  return null;
};

const normalizeLocalResult = (
  source: KnowledgeSource,
  entry: KnowledgeEntry,
  score: number,
): KnowledgeResult => ({
  ...entry,
  sourceId: source.id,
  sourceName: source.name,
  sourceKind: source.kind,
  score,
});

export class SqliteMemorySource implements MemorySourceProvider {
  readonly definition: KnowledgeSource;

  private readonly repository: KnowledgeRepository;

  private readonly embeddingGenerator: EmbeddingGenerator;

  constructor(
    definition: KnowledgeSource,
    repository: KnowledgeRepository = new KnowledgeRepository(),
    embeddingGenerator: EmbeddingGenerator = generateEmbedding,
  ) {
    this.definition = definition;
    this.repository = repository;
    this.embeddingGenerator = embeddingGenerator;
  }

  async storeKnowledge(input: StoreKnowledgeInput): Promise<KnowledgeEntry> {
    const embedding = await tryGenerateEmbedding(
      this.embeddingGenerator,
      buildEmbeddingInput(input.title, input.content, input.tags),
      "store",
    );

    return this.repository.createEntry({
      ...input,
      repo: input.repo ?? null,
      domain: input.domain ?? null,
      embedding,
    });
  }

  async searchKnowledge(input: {
    query: string;
    repo?: string;
    domain?: string;
    limit: number;
  }): Promise<KnowledgeResult[]> {
    const embedding = await tryGenerateEmbedding(this.embeddingGenerator, input.query, "search");
    const results = embedding
      ? this.repository.searchEntries(embedding, {
          ...input,
          query: input.query,
        })
      : this.repository.searchEntriesByText(input.query, input);

    return results.map((entry) => normalizeLocalResult(this.definition, entry, entry.score));
  }

  async resolveContext(input: ResolveContextInput): Promise<KnowledgeResult[]> {
    const embedding = await tryGenerateEmbedding(this.embeddingGenerator, input.task, "resolve");
    const results = embedding
      ? this.repository.resolveContext(embedding, input)
      : this.repository.resolveContextByText(input);

    return results.map((entry) => normalizeLocalResult(this.definition, entry, entry.score));
  }

  async listKnowledge(filters: KnowledgeListFilters): Promise<KnowledgeEntry[]> {
    return this.repository.listEntries(filters);
  }

  async getKnowledge(ids: string[]): Promise<KnowledgeEntry[]> {
    return ids
      .map((id) => this.repository.getEntryById(id))
      .filter((e): e is KnowledgeEntry => e !== null);
  }
}
