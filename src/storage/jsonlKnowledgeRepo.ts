import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getJsonlKnowledgePath } from "../db/database.js";
import {
  rankEntriesByTextMatch,
  type RankedKnowledgeEntry,
} from "../search/semanticSearch.js";
import {
  knowledgeContentBlockSchema,
  knowledgeEntryInputSchema,
  knowledgeEntrySchema,
  knowledgeListFiltersSchema,
  knowledgeSearchFiltersSchema,
  resolveContextInputSchema,
  type KnowledgeContentBlock,
  type KnowledgeEntry,
  type KnowledgeEntryInput,
  type KnowledgeListFilters,
  type KnowledgeSearchFilters,
  type ResolveContextInput,
} from "../types/knowledge.js";
import { readSqliteKnowledgeEntries, writeKnowledgeJsonl } from "./sqliteToJsonlMigration.js";

type ParsedKnowledgeEntryInput = z.output<typeof knowledgeEntryInputSchema>;

const contentToBody = (content: string): KnowledgeContentBlock[] =>
  content
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ type: "paragraph", text }));

const normalizeEntry = (value: unknown): KnowledgeEntry => {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const content = typeof raw.content === "string" ? raw.content : "";
  const body = z.array(knowledgeContentBlockSchema).safeParse(raw.body);

  return knowledgeEntrySchema.parse({
    ...raw,
    body: body.success && body.data.length > 0 ? body.data : contentToBody(content),
    embedding: null,
  });
};

const serializeEntry = (entry: KnowledgeEntry): string =>
  JSON.stringify({
    ...entry,
    embedding: null,
  });

const buildWherePredicate = (
  filters: Pick<Partial<KnowledgeListFilters>, "type" | "repo" | "domain">,
): ((entry: KnowledgeEntry) => boolean) =>
  (entry) => {
    if (filters.type && entry.type !== filters.type) return false;
    if (filters.repo && entry.repo !== filters.repo && entry.repo !== null) return false;
    if (filters.domain && entry.domain !== filters.domain && entry.domain !== null) return false;
    return true;
  };

const applyScopeRanking = (
  entries: RankedKnowledgeEntry[],
  repo?: string,
  domain?: string,
): RankedKnowledgeEntry[] =>
  entries
    .map((entry) => {
      let score = entry.score;

      if (entry.scope === "global") score += 0.02;
      if (repo && entry.scope === "repo" && entry.repo === repo) score += 0.12;
      if (domain && entry.scope === "domain" && entry.domain === domain) score += 0.1;
      if (entry.scope === "team") score += 0.03;

      return { ...entry, score };
    })
    .sort((left, right) => right.score - left.score);

export class JsonlKnowledgeRepository {
  constructor(private readonly filePath: string = getJsonlKnowledgePath()) {}

  init(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const migrated = this.migrateLegacyProjectDatabase();
      if (!migrated) {
        fs.writeFileSync(this.filePath, "", "utf8");
      }
    }
  }

  createEntry(input: KnowledgeEntryInput): KnowledgeEntry {
    const parsedInput = knowledgeEntryInputSchema.parse(input);
    const entries = this.readEntries();
    const existingIndex = parsedInput.id
      ? this.findEntryIndexById(entries, parsedInput.id)
      : this.findEntryIndexByIdentity(entries, parsedInput) ??
        this.findSingleEntryIndexByPortableIdentity(entries, parsedInput);

    if (existingIndex !== null) {
      const updated = this.buildUpdatedEntry(entries[existingIndex]!, parsedInput);
      entries[existingIndex] = updated;
      this.writeEntries(entries);
      return updated;
    }

    const now = new Date().toISOString();
    const entry = knowledgeEntrySchema.parse({
      id: parsedInput.id ?? randomUUID(),
      title: parsedInput.title,
      type: parsedInput.type,
      content: parsedInput.content,
      body: parsedInput.body.length > 0 ? parsedInput.body : contentToBody(parsedInput.content),
      summary: parsedInput.summary ?? null,
      scope: parsedInput.scope,
      repo: parsedInput.repo ?? null,
      domain: parsedInput.domain ?? null,
      tags: parsedInput.tags,
      embedding: null,
      createdAt: now,
      updatedAt: now,
      confidence: parsedInput.confidence,
      url: parsedInput.url ?? null,
      metadata: parsedInput.metadata,
    });

    this.writeEntries([entry, ...entries]);
    return entry;
  }

  getEntryById(id: string): KnowledgeEntry | null {
    return this.readEntries().find((entry) => entry.id === id) ?? null;
  }

  listEntries(filters: Partial<KnowledgeListFilters> = {}): KnowledgeEntry[] {
    const parsedFilters = knowledgeListFiltersSchema.parse(filters);
    const predicate = buildWherePredicate(parsedFilters);

    return this.readEntries()
      .filter(predicate)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, parsedFilters.limit);
  }

  searchEntries(
    _queryEmbedding: number[],
    filters: Partial<KnowledgeSearchFilters> = {},
  ): RankedKnowledgeEntry[] {
    const parsedFilters = knowledgeSearchFiltersSchema.parse(filters);
    return this.searchEntriesByText(parsedFilters.query, parsedFilters);
  }

  searchEntriesByText(
    query: string,
    filters: Partial<KnowledgeSearchFilters> = {},
  ): RankedKnowledgeEntry[] {
    const parsedFilters = knowledgeSearchFiltersSchema.parse({ ...filters, query });
    const candidateLimit = Math.max(parsedFilters.limit, 200);
    const candidates = this.listEntries({
      repo: parsedFilters.repo,
      domain: parsedFilters.domain,
      limit: candidateLimit,
    });

    return rankEntriesByTextMatch(candidates, query)
      .filter((entry) => entry.score > 0)
      .slice(0, parsedFilters.limit);
  }

  resolveContext(_queryEmbedding: number[], input: ResolveContextInput): RankedKnowledgeEntry[] {
    return this.resolveContextByText(input);
  }

  resolveContextByText(input: ResolveContextInput): RankedKnowledgeEntry[] {
    const parsedInput = resolveContextInputSchema.parse(input);
    const candidateLimit = Math.max(parsedInput.limit, 200);
    const candidates = this.listEntries({
      repo: parsedInput.repo,
      domain: parsedInput.domain,
      limit: candidateLimit,
    }).filter((entry) => {
      if (entry.scope === "repo") {
        return Boolean(parsedInput.repo) && entry.repo === parsedInput.repo;
      }
      if (entry.scope === "domain") {
        return Boolean(parsedInput.domain) && entry.domain === parsedInput.domain;
      }
      return true;
    });

    return applyScopeRanking(
      rankEntriesByTextMatch(candidates, parsedInput.task).filter((entry) => entry.score > 0),
      parsedInput.repo,
      parsedInput.domain,
    ).slice(0, parsedInput.limit);
  }

  private buildUpdatedEntry(existing: KnowledgeEntry, input: ParsedKnowledgeEntryInput): KnowledgeEntry {
    return knowledgeEntrySchema.parse({
      ...existing,
      title: input.title,
      type: input.type,
      content: input.content,
      body: input.body.length > 0 ? input.body : contentToBody(input.content),
      summary: input.summary ?? null,
      scope: input.scope,
      repo: input.repo ?? null,
      domain: input.domain ?? null,
      tags: input.tags,
      embedding: null,
      confidence: input.confidence,
      url: input.url ?? null,
      metadata: input.metadata,
      updatedAt: new Date().toISOString(),
    });
  }

  private findEntryIndexByIdentity(
    entries: KnowledgeEntry[],
    input: ParsedKnowledgeEntryInput,
  ): number | null {
    const index = entries.findIndex(
      (entry) =>
        entry.title.toLowerCase() === input.title.toLowerCase() &&
        entry.type === input.type &&
        entry.scope === input.scope &&
        (entry.repo ?? "") === (input.repo ?? "") &&
        (entry.domain ?? "") === (input.domain ?? ""),
    );

    return index >= 0 ? index : null;
  }

  private findEntryIndexById(entries: KnowledgeEntry[], id: string): number | null {
    const index = entries.findIndex((entry) => entry.id === id);
    return index >= 0 ? index : null;
  }

  private findSingleEntryIndexByPortableIdentity(
    entries: KnowledgeEntry[],
    input: ParsedKnowledgeEntryInput,
  ): number | null {
    const matches = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) =>
        entry.title.toLowerCase() === input.title.toLowerCase() &&
        entry.type === input.type &&
        ((entry.repo ?? "") === (input.repo ?? "") || entry.repo === null || !input.repo) &&
        ((entry.domain ?? "") === (input.domain ?? "") || entry.domain === null || !input.domain),
      );

    return matches.length === 1 ? matches[0]!.index : null;
  }

  private readEntries(): KnowledgeEntry[] {
    this.init();
    const raw = fs.readFileSync(this.filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => normalizeEntry(JSON.parse(line) as unknown));
  }

  private writeEntries(entries: KnowledgeEntry[]): void {
    this.init();
    const text = entries.map(serializeEntry).join("\n");
    fs.writeFileSync(this.filePath, text ? `${text}\n` : "", "utf8");
  }

  private migrateLegacyProjectDatabase(): boolean {
    const legacyPath = path.join(path.dirname(this.filePath), "knowit.db");
    if (!fs.existsSync(legacyPath)) {
      return false;
    }

    const entries = readSqliteKnowledgeEntries(legacyPath);
    writeKnowledgeJsonl(this.filePath, entries);
    return true;
  }
}
