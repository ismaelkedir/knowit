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

type EmbeddingGenerator = (text: string) => Promise<number[]>;

const tryGenerateEmbedding = async (
  embeddingGenerator: EmbeddingGenerator,
  text: string,
): Promise<number[] | null> => {
  try {
    return await embeddingGenerator(text);
  } catch {
    return null;
  }
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
    const embedding = await tryGenerateEmbedding(this.embeddingGenerator, input.query);
    const results = embedding
      ? this.repository.searchEntries(embedding, {
          ...input,
          query: input.query,
        })
      : this.repository.searchEntriesByText(input.query, input);

    return results.map((entry) => normalizeLocalResult(this.definition, entry, entry.score));
  }

  async resolveContext(input: ResolveContextInput): Promise<KnowledgeResult[]> {
    const embedding = await tryGenerateEmbedding(this.embeddingGenerator, input.task);
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
