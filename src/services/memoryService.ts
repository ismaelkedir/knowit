import { KnowledgeRepository } from "../db/knowledgeRepo.js";
import { SourceRepository } from "../db/sourceRepo.js";
import {
  knowledgeListFiltersSchema,
  knowledgeSearchFiltersSchema,
  resolveContextInputSchema,
  storeKnowledgeInputSchema,
  type KnowledgeEntry,
  type KnowledgeListFilters,
  type KnowledgeResult,
  type ResolveContextInput,
  type StoreKnowledgeInput,
} from "../types/knowledge.js";
import type {
  ConnectKnownSourceInput,
  CreateMcpSourceInput,
  KnowledgeSource,
} from "../types/source.js";
import { SourceRegistry } from "../sources/sourceRegistry.js";

export interface KnowledgeStats {
  totalEntries: number;
  byType: Record<string, number>;
  byRepo: Record<string, number>;
  byDomain: Record<string, number>;
  recentEntries: Array<{
    id: string;
    title: string;
    type: string;
    updatedAt: string;
  }>;
}

export class MemoryService {
  private readonly knowledgeRepository: KnowledgeRepository;

  private readonly sourceRepository: SourceRepository;

  private readonly sourceRegistry: SourceRegistry;

  constructor() {
    this.knowledgeRepository = new KnowledgeRepository();
    this.sourceRepository = new SourceRepository();
    this.sourceRegistry = new SourceRegistry(this.knowledgeRepository);
  }

  init(): void {
    this.knowledgeRepository.init();
    this.sourceRepository.init();
    this.sourceRepository.ensureLocalSource();
  }

  listSources(): KnowledgeSource[] {
    this.init();
    return this.sourceRepository.listSources();
  }

  registerMcpSource(input: CreateMcpSourceInput): KnowledgeSource {
    this.init();
    return this.sourceRepository.createMcpSource(input);
  }

  connectKnownSource(input: ConnectKnownSourceInput): KnowledgeSource {
    this.init();
    return this.sourceRepository.connectKnownSource(input);
  }

  async storeKnowledge(input: StoreKnowledgeInput): Promise<KnowledgeEntry> {
    this.init();
    const parsedInput = storeKnowledgeInputSchema.parse(input);
    const source = this.getSelectedSource(parsedInput.source);
    const provider = this.sourceRegistry.createProvider(source);
    return provider.storeKnowledge(parsedInput);
  }

  async searchKnowledge(input: {
    query: string;
    source?: string;
    repo?: string;
    domain?: string;
    limit?: number;
  }): Promise<KnowledgeResult[]> {
    this.init();
    const parsedInput = knowledgeSearchFiltersSchema.parse(input);
    const providers = this.getSelectedProviders(parsedInput.source);
    const perSourceLimit = parsedInput.limit;
    const results = await Promise.all(
      providers.map((provider) =>
        provider.searchKnowledge({
          query: parsedInput.query,
          repo: parsedInput.repo,
          domain: parsedInput.domain,
          limit: perSourceLimit,
        }),
      ),
    );

    return results
      .flat()
      .sort((left, right) => right.score - left.score)
      .slice(0, parsedInput.limit);
  }

  async resolveContext(input: ResolveContextInput): Promise<KnowledgeResult[]> {
    this.init();
    const parsedInput = resolveContextInputSchema.parse(input);
    const providers = this.getSelectedProviders(parsedInput.source);
    const results = await Promise.all(providers.map((provider) => provider.resolveContext(parsedInput)));

    return results
      .flat()
      .sort((left, right) => right.score - left.score)
      .slice(0, parsedInput.limit);
  }

  async listKnowledge(filters: KnowledgeListFilters & { source?: string }): Promise<KnowledgeEntry[]> {
    this.init();
    const parsedFilters = knowledgeListFiltersSchema.parse(filters);
    const source = this.getSelectedSource(filters.source);
    const provider = this.sourceRegistry.createProvider(source);

    if (!provider.listKnowledge) {
      throw new Error(`Source ${source.id} does not support listing knowledge entries.`);
    }

    return provider.listKnowledge(parsedFilters);
  }

  async getKnowledgeEntry(input: { id: string; source?: string }): Promise<KnowledgeEntry | null> {
    this.init();
    const source = this.getSelectedSource(input.source);

    if (source.kind === "sqlite") {
      return this.knowledgeRepository.getEntryById(input.id);
    }

    const provider = this.sourceRegistry.createProvider(source);
    if (!provider.listKnowledge) {
      throw new Error(`Source ${source.id} does not support reading individual knowledge entries.`);
    }

    const entries = await provider.listKnowledge({ limit: 500 });
    return entries.find((entry) => entry.id === input.id) ?? null;
  }

  async getKnowledgeStats(filters: KnowledgeListFilters & { source?: string }): Promise<KnowledgeStats> {
    this.init();
    const entries = await this.listKnowledge(filters);
    const byType: Record<string, number> = {};
    const byRepo: Record<string, number> = {};
    const byDomain: Record<string, number> = {};

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1;
      byRepo[entry.repo ?? "none"] = (byRepo[entry.repo ?? "none"] ?? 0) + 1;
      byDomain[entry.domain ?? "none"] = (byDomain[entry.domain ?? "none"] ?? 0) + 1;
    }

    return {
      totalEntries: entries.length,
      byType,
      byRepo,
      byDomain,
      recentEntries: entries.slice(0, 5).map((entry) => ({
        id: entry.id,
        title: entry.title,
        type: entry.type,
        updatedAt: entry.updatedAt,
      })),
    };
  }

  private getSelectedProviders(sourceId?: string) {
    if (sourceId) {
      const source = this.getSelectedSource(sourceId);
      if (source.kind === "route") {
        throw new Error(
          `Source ${source.id} is a routed provider. Use its guidance and the provider MCP directly instead of calling Knowit storage/search on it.`,
        );
      }

      return [this.sourceRegistry.createProvider(source)];
    }

    return this.sourceRepository
      .listSources()
      .filter((source) => source.kind !== "route")
      .map((source) => this.sourceRegistry.createProvider(source));
  }

  private getSelectedSource(sourceId?: string): KnowledgeSource {
    if (!sourceId) {
      return this.sourceRepository.getDefaultSource();
    }

    const source = this.sourceRepository.getSourceById(sourceId);
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }

    return source;
  }
}
