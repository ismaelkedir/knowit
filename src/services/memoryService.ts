import { KnowledgeRepository } from "../db/knowledgeRepo.js";
import { SourceRepository } from "../db/sourceRepo.js";
import { loadCredentials } from "../utils/credentials.js";
import {
  knowledgeListFiltersSchema,
  knowledgeSearchFiltersSchema,
  resolveContextInputSchema,
  resolveSourceActionInputSchema,
  sourceActionResultSchema,
  storeKnowledgeInputSchema,
  type KnowledgeEntry,
  type KnowledgeListFilters,
  type KnowledgeResult,
  type ResolveContextInput,
  type ResolveSourceActionInput,
  type SourceActionResult,
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

  private cloudSourceBootstrapped = false;

  init(): void {
    this.knowledgeRepository.init();
    this.sourceRepository.init();
    this.sourceRepository.ensureLocalSource();
    this.bootstrapCloudSource();
  }

  private bootstrapCloudSource(): void {
    if (this.cloudSourceBootstrapped) return;
    this.cloudSourceBootstrapped = true;

    const token = process.env.KNOWIT_CLOUD_TOKEN;
    const apiUrl = process.env.KNOWIT_CLOUD_API_URL ?? "https://www.useknowit.dev";

    if (!token) {
      // Fall back to credentials file
      const creds = loadCredentials();
      if (!creds) return;
      this.upsertCloudSource(creds.token, creds.cloudApiUrl);
      return;
    }

    this.upsertCloudSource(token, apiUrl);
  }

  private upsertCloudSource(token: string, apiUrl: string): void {
    this.sourceRepository.upsertSyntheticSource({
      id: "cloud",
      name: "Knowit Cloud",
      kind: "cloud",
      isDefault: true,
      config: { mode: "cloud", apiUrl, token },
    });
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
    const source = parsedInput.source ? this.getSelectedSource(parsedInput.source) : this.getPreferredDirectSource();
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
    const source = filters.source ? this.getSelectedSource(filters.source) : this.getPreferredDirectSource();
    const provider = this.sourceRegistry.createProvider(source);

    if (!provider.listKnowledge) {
      throw new Error(`Source ${source.id} does not support listing knowledge entries.`);
    }

    return provider.listKnowledge(parsedFilters);
  }

  async getKnowledge(input: { ids: string[]; source?: string }): Promise<KnowledgeEntry[]> {
    this.init();
    const source = input.source ? this.getSelectedSource(input.source) : this.getPreferredDirectSource();
    const provider = this.sourceRegistry.createProvider(source);

    if (!provider.getKnowledge) {
      throw new Error(`Source ${source.id} does not support fetching entries by ID.`);
    }

    return provider.getKnowledge(input.ids);
  }

  async getKnowledgeEntry(input: { id: string; source?: string }): Promise<KnowledgeEntry | null> {
    this.init();
    const source = input.source ? this.getSelectedSource(input.source) : this.getPreferredDirectSource();

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

  async resolveSourceAction(input: ResolveSourceActionInput): Promise<SourceActionResult> {
    this.init();
    const parsedInput = resolveSourceActionInputSchema.parse(input);
    const source = this.getSelectedSource(parsedInput.source);
    const lookupText =
      parsedInput.query ?? parsedInput.task ?? parsedInput.title ?? parsedInput.artifactType;

    const relevantKnowledge =
      source.kind === "route"
        ? await this.searchKnowledge({
            query: lookupText,
            source: "local",
            repo: parsedInput.repo,
            domain: parsedInput.domain,
            limit: 5,
          })
        : await this.searchKnowledge({
            query: lookupText,
            source: source.id,
            repo: parsedInput.repo,
            domain: parsedInput.domain,
            limit: 5,
          });

    if (source.kind === "route") {
      const routeConfig = source.config.mode === "route" ? source.config : null;
      if (!routeConfig) {
        throw new Error(`Source ${source.id} is routed but does not have route configuration.`);
      }
      const nextStep =
        parsedInput.action === "write"
          ? `Use the ${routeConfig.mcpServerName} MCP next to write the canonical ${parsedInput.artifactType}.`
          : `Use the ${routeConfig.mcpServerName} MCP next to read the canonical ${parsedInput.artifactType}.`;

      return sourceActionResultSchema.parse({
        mode: "route",
        action: parsedInput.action,
        artifactType: parsedInput.artifactType,
        sourceId: source.id,
        sourceName: source.name,
        sourceKind: source.kind,
        shouldUseKnowitDirectly: false,
        mcpServerName: routeConfig.mcpServerName,
        provider: routeConfig.provider,
        nextStep,
        readHint: routeConfig.readHint,
        writeHint: routeConfig.writeHint,
        storeDistilledMemory: true,
        relevantKnowledge,
      });
    }

    return sourceActionResultSchema.parse({
      mode: "local",
      action: parsedInput.action,
      artifactType: parsedInput.artifactType,
      sourceId: source.id,
      sourceName: source.name,
      sourceKind: source.kind,
      shouldUseKnowitDirectly: true,
      mcpServerName: null,
      provider: null,
      nextStep:
        parsedInput.action === "write"
          ? `Store the ${parsedInput.artifactType} directly in Knowit.`
          : `Read the ${parsedInput.artifactType} directly from Knowit.`,
      readHint: "Use Knowit search or context resolution directly.",
      writeHint: "Use Knowit store_knowledge directly.",
      storeDistilledMemory: false,
      relevantKnowledge,
    });
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

    // Use only the default source. Fan-out to all sources was removed because
    // when cloud is connected it should be the single source of truth — querying
    // local in parallel creates noise and splits the knowledge base.
    const defaultSource = this.sourceRepository.getDefaultSource();
    if (defaultSource.kind === "route") {
      // Routed default (e.g. Notion) — fall back to local for direct queries
      const localSource = this.sourceRepository.getSourceById("local");
      if (!localSource) throw new Error("Local source is missing. Run knowit install to recreate it.");
      return [this.sourceRegistry.createProvider(localSource)];
    }
    return [this.sourceRegistry.createProvider(defaultSource)];
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

  private getPreferredDirectSource(): KnowledgeSource {
    const defaultSource = this.sourceRepository.getDefaultSource();
    if (defaultSource.kind !== "route") {
      return defaultSource;
    }

    const localSource = this.sourceRepository.getSourceById("local");
    if (!localSource) {
      throw new Error("Local source is missing. Run knowit install or knowit init to recreate it.");
    }

    return localSource;
  }
}
