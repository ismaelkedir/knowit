import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  KnowledgeContentBlock,
  KnowledgeEntry,
  KnowledgeListFilters,
  KnowledgeResult,
  ResolveContextInput,
  StoreKnowledgeInput,
} from "../types/knowledge.js";
import type { KnowledgeSource } from "../types/source.js";
import type { MemorySourceProvider } from "./base.js";

const parseJsonText = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractToolPayload = (result: Awaited<ReturnType<Client["callTool"]>>): unknown => {
  if ("structuredContent" in result && result.structuredContent) {
    return result.structuredContent;
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const textContent = content.find(
    (item: unknown): item is { type: "text"; text: string } =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      "text" in item &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string",
  );
  if (textContent && "text" in textContent) {
    return parseJsonText(textContent.text) ?? textContent.text;
  }

  return null;
};

const normalizeRemoteEntry = (
  source: KnowledgeSource,
  item: unknown,
  fallback: Partial<KnowledgeEntry> = {},
): KnowledgeResult => {
  const raw = item && typeof item === "object" && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : {};
  const now = new Date().toISOString();
  const scoreValue = typeof raw.score === "number" ? raw.score : 0.5;
  const body = Array.isArray(raw.body) ? (raw.body as KnowledgeContentBlock[]) : fallback.body ?? [];

  return {
    id: typeof raw.id === "string" ? raw.id : randomUUID(),
    title: typeof raw.title === "string" ? raw.title : fallback.title ?? "Untitled entry",
    type:
      raw.type === "rule" ||
      raw.type === "architecture" ||
      raw.type === "pattern" ||
      raw.type === "decision" ||
      raw.type === "convention" ||
      raw.type === "note"
        ? raw.type
        : fallback.type ?? "note",
    content: typeof raw.content === "string" ? raw.content : fallback.content ?? "",
    body,
    scope:
      raw.scope === "global" ||
      raw.scope === "team" ||
      raw.scope === "repo" ||
      raw.scope === "domain"
        ? raw.scope
        : fallback.scope ?? "global",
    repo: typeof raw.repo === "string" ? raw.repo : fallback.repo ?? null,
    domain: typeof raw.domain === "string" ? raw.domain : fallback.domain ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    embedding: null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
    confidence: typeof raw.confidence === "number" ? raw.confidence : fallback.confidence ?? 0.7,
    url: typeof raw.url === "string" ? raw.url : null,
    metadata: raw,
    sourceId: source.id,
    sourceName: source.name,
    sourceKind: source.kind,
    score: Math.max(0, Math.min(1, scoreValue)),
  };
};

export class McpMemorySource implements MemorySourceProvider {
  readonly definition: KnowledgeSource;

  private clientPromise: Promise<Client> | null = null;

  constructor(definition: KnowledgeSource) {
    this.definition = definition;
  }

  private async getClient(): Promise<Client> {
    if (this.clientPromise) {
      return this.clientPromise;
    }

    this.clientPromise = (async () => {
      if (this.definition.config.mode !== "mcp") {
        throw new Error(`Source ${this.definition.id} is not an MCP-backed source.`);
      }

      const client = new Client(
        { name: "knowit-source-client", version: "0.2.2" },
        { capabilities: {} },
      );

      const transport = new StdioClientTransport({
        command: this.definition.config.command,
        args: this.definition.config.args,
        cwd: this.definition.config.cwd,
        env: this.definition.config.env,
        stderr: "inherit",
      });

      await client.connect(transport);
      return client;
    })();

    return this.clientPromise;
  }

  async storeKnowledge(input: StoreKnowledgeInput): Promise<KnowledgeEntry> {
    if (this.definition.config.mode !== "mcp" || !this.definition.config.toolMap.store) {
      throw new Error(`Source ${this.definition.id} does not support storing knowledge.`);
    }

    const client = await this.getClient();
    const result = await client.callTool({
      name: this.definition.config.toolMap.store,
      arguments: input,
    });
    const payload = extractToolPayload(result);
    const normalized = normalizeRemoteEntry(this.definition, payload, { ...input, body: [] });
    const { sourceId: _sourceId, sourceKind: _sourceKind, sourceName: _sourceName, score: _score, matchedOn: _matchedOn, ...entry } = normalized;
    return { ...entry, content: entry.content ?? input.content };
  }

  async searchKnowledge(input: {
    query: string;
    repo?: string;
    domain?: string;
    limit: number;
  }): Promise<KnowledgeResult[]> {
    if (this.definition.config.mode !== "mcp" || !this.definition.config.toolMap.search) {
      return [];
    }

    const client = await this.getClient();
    const result = await client.callTool({
      name: this.definition.config.toolMap.search,
      arguments: input,
    });
    const payload = extractToolPayload(result);
    const items = Array.isArray(payload) ? payload : payload ? [payload] : [];

    return items
      .map((item) => normalizeRemoteEntry(this.definition, item))
      .slice(0, input.limit);
  }

  async resolveContext(input: ResolveContextInput): Promise<KnowledgeResult[]> {
    if (this.definition.config.mode !== "mcp" || !this.definition.config.toolMap.resolve) {
      return [];
    }

    const client = await this.getClient();
    const result = await client.callTool({
      name: this.definition.config.toolMap.resolve,
      arguments: input,
    });
    const payload = extractToolPayload(result);
    const rawResults =
      payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray((payload as { results?: unknown[] }).results)
        ? (payload as { results: unknown[] }).results
        : Array.isArray(payload)
          ? payload
          : payload
            ? [payload]
            : [];

    return rawResults
      .map((item) => normalizeRemoteEntry(this.definition, item))
      .slice(0, input.limit);
  }

  async listKnowledge(_filters: KnowledgeListFilters): Promise<KnowledgeEntry[]> {
    return [];
  }
}
