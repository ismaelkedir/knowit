import type {
  KnowledgeEntry,
  KnowledgeListFilters,
  KnowledgeResult,
  ResolveContextInput,
  StoreKnowledgeInput,
} from "../types/knowledge.js";
import type { KnowledgeSource } from "../types/source.js";
import type { MemorySourceProvider } from "./base.js";

export class CloudMemorySource implements MemorySourceProvider {
  readonly definition: KnowledgeSource;
  private readonly apiUrl: string;
  private readonly token: string;

  constructor(source: KnowledgeSource) {
    this.definition = source;
    if (source.config.mode !== "cloud") {
      throw new Error("CloudMemorySource requires a cloud config");
    }
    this.apiUrl = source.config.apiUrl;
    this.token = source.config.token;
  }

  private async call<T>(
    procedure: string,
    input: unknown,
    method: "GET" | "POST" = "POST"
  ): Promise<T> {
    const url = `${this.apiUrl}/api/trpc/${procedure}`;
    const isQuery = method === "GET";

    const res = await fetch(isQuery ? `${url}?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      ...(isQuery ? {} : { body: JSON.stringify({ json: input }) }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Knowit Cloud API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { result?: { data?: { json: T } }; error?: { message: string } };
    if (data.error) throw new Error(data.error.message);
    return data.result?.data?.json as T;
  }

  async storeKnowledge(input: StoreKnowledgeInput): Promise<KnowledgeEntry> {
    return this.call<KnowledgeEntry>("knowledge.store", input);
  }

  async searchKnowledge(input: {
    query: string;
    repo?: string;
    domain?: string;
    limit: number;
  }): Promise<KnowledgeResult[]> {
    const results = await this.call<KnowledgeResult[]>("knowledge.search", input);
    return results.map((r) => ({
      ...r,
      sourceId: this.definition.id,
      sourceName: this.definition.name,
      sourceKind: "cloud" as const,
    }));
  }

  async resolveContext(input: ResolveContextInput): Promise<KnowledgeResult[]> {
    const results = await this.call<KnowledgeResult[]>("knowledge.resolve", input);
    return results.map((r) => ({
      ...r,
      sourceId: this.definition.id,
      sourceName: this.definition.name,
      sourceKind: "cloud" as const,
    }));
  }

  async listKnowledge(filters: KnowledgeListFilters): Promise<KnowledgeEntry[]> {
    return this.call<KnowledgeEntry[]>("knowledge.list", filters, "GET");
  }

  async getKnowledge(ids: string[]): Promise<KnowledgeEntry[]> {
    return this.call<KnowledgeEntry[]>("knowledge.get", { ids }, "GET");
  }
}
