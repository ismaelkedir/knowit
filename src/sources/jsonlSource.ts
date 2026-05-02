import { JsonlKnowledgeRepository } from "../storage/jsonlKnowledgeRepo.js";
import {
  storeKnowledgeInputSchema,
  type KnowledgeEntry,
  type KnowledgeListFilters,
  type KnowledgeResult,
  type ResolveContextInput,
  type StoreKnowledgeInput,
} from "../types/knowledge.js";
import type { KnowledgeSource } from "../types/source.js";
import type { MemorySourceProvider } from "./base.js";

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

export class JsonlMemorySource implements MemorySourceProvider {
  readonly definition: KnowledgeSource;

  constructor(
    definition: KnowledgeSource,
    private readonly repository: JsonlKnowledgeRepository = new JsonlKnowledgeRepository(),
  ) {
    this.definition = definition;
  }

  async storeKnowledge(input: StoreKnowledgeInput): Promise<KnowledgeEntry> {
    const parsedInput = storeKnowledgeInputSchema.parse(input);

    return this.repository.createEntry({
      ...parsedInput,
      repo: parsedInput.repo ?? null,
      domain: parsedInput.domain ?? null,
      embedding: null,
    });
  }

  async searchKnowledge(input: {
    query: string;
    repo?: string;
    domain?: string;
    limit: number;
  }): Promise<KnowledgeResult[]> {
    const results = this.repository.searchEntriesByText(input.query, input);
    return results.map((entry) => normalizeLocalResult(this.definition, entry, entry.score));
  }

  async resolveContext(input: ResolveContextInput): Promise<KnowledgeResult[]> {
    const results = this.repository.resolveContextByText(input);
    return results.map((entry) => normalizeLocalResult(this.definition, entry, entry.score));
  }

  async listKnowledge(filters: KnowledgeListFilters): Promise<KnowledgeEntry[]> {
    return this.repository.listEntries(filters);
  }

  async getKnowledge(ids: string[]): Promise<KnowledgeEntry[]> {
    return ids
      .map((id) => this.repository.getEntryById(id))
      .filter((entry): entry is KnowledgeEntry => entry !== null);
  }
}
