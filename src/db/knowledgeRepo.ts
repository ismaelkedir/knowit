import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { getDatabase, initializeDatabase } from "./database.js";
import {
  rankEntriesBySimilarity,
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
  type KnowledgeEntry,
  type KnowledgeContentBlock,
  type KnowledgeEntryInput,
  type KnowledgeListFilters,
  type KnowledgeSearchFilters,
  type ResolveContextInput,
} from "../types/knowledge.js";

type ParsedKnowledgeEntryInput = z.output<typeof knowledgeEntryInputSchema>;

interface KnowledgeRow {
  id: string;
  title: string;
  type: string;
  content: string;
  body: string | null;
  summary: string | null;
  scope: string;
  repo: string | null;
  domain: string | null;
  tags: string;
  embedding: string | null;
  created_at: string;
  updated_at: string;
  confidence: number;
  url: string | null;
  metadata: string;
}

const parseTags = (rawTags: string): string[] =>
  rawTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const serializeTags = (tags: string[]): string =>
  tags.map((tag) => tag.trim()).filter(Boolean).join(",");

const parseEmbedding = (rawEmbedding: string | null): number[] | null => {
  if (!rawEmbedding) {
    return null;
  }

  const parsed = JSON.parse(rawEmbedding) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "number")) {
    return null;
  }

  return parsed;
};

const parseMetadata = (rawMetadata: string): Record<string, unknown> => {
  const parsed = JSON.parse(rawMetadata) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
};

const contentToBody = (content: string): KnowledgeContentBlock[] =>
  content
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ type: "paragraph", text }));

const parseBody = (rawBody: string | null, content: string): KnowledgeContentBlock[] => {
  if (!rawBody) {
    return contentToBody(content);
  }

  const parsed = JSON.parse(rawBody) as unknown;
  const body = z.array(knowledgeContentBlockSchema).safeParse(parsed);
  return body.success && body.data.length > 0 ? body.data : contentToBody(content);
};

const mapRowToEntry = (row: KnowledgeRow): KnowledgeEntry =>
  knowledgeEntrySchema.parse({
    id: row.id,
    title: row.title,
    type: row.type,
    content: row.content,
    body: parseBody(row.body, row.content),
    summary: row.summary,
    scope: row.scope,
    repo: row.repo,
    domain: row.domain,
    tags: parseTags(row.tags),
    embedding: parseEmbedding(row.embedding),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confidence: row.confidence,
    url: row.url,
    metadata: parseMetadata(row.metadata),
  });

const buildWhereClause = (
  filters: Pick<Partial<KnowledgeListFilters>, "type" | "repo" | "domain">,
): { clause: string; params: Record<string, string | number> } => {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.type) {
    conditions.push("type = @type");
    params.type = filters.type;
  }

  if (filters.repo) {
    conditions.push("(repo = @repo OR repo IS NULL)");
    params.repo = filters.repo;
  }

  if (filters.domain) {
    conditions.push("(domain = @domain OR domain IS NULL)");
    params.domain = filters.domain;
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
};

const applyScopeRanking = (
  entries: RankedKnowledgeEntry[],
  repo?: string,
  domain?: string,
): RankedKnowledgeEntry[] =>
  entries
    .map((entry) => {
      let score = entry.score;

      if (entry.scope === "global") {
        score += 0.02;
      }
      if (repo && entry.scope === "repo" && entry.repo === repo) {
        score += 0.12;
      }
      if (domain && entry.scope === "domain" && entry.domain === domain) {
        score += 0.1;
      }
      if (entry.scope === "team") {
        score += 0.03;
      }

      return {
        ...entry,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);

export class KnowledgeRepository {
  private readonly db: Database.Database;

  constructor(database: Database.Database = getDatabase()) {
    this.db = database;
  }

  init(): void {
    initializeDatabase(this.db);
  }

  createEntry(input: KnowledgeEntryInput): KnowledgeEntry {
    const parsedInput = knowledgeEntryInputSchema.parse(input);

    const existing = parsedInput.id
      ? this.getEntryById(parsedInput.id)
      : this.findEntryByIdentity(
          parsedInput.title,
          parsedInput.type,
          parsedInput.scope,
          parsedInput.repo ?? null,
          parsedInput.domain ?? null,
        ) ?? this.findSingleEntryByPortableIdentity(
          parsedInput.title,
          parsedInput.type,
          parsedInput.repo ?? null,
          parsedInput.domain ?? null,
        );

    if (existing) {
      return this.updateEntryById(existing.id, parsedInput);
    }

    const now = new Date().toISOString();
    const entry: KnowledgeEntry = knowledgeEntrySchema.parse({
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
      embedding: parsedInput.embedding ?? null,
      createdAt: now,
      updatedAt: now,
      confidence: parsedInput.confidence,
      url: parsedInput.url ?? null,
      metadata: parsedInput.metadata,
    });

    this.db
      .prepare(
        `
          INSERT INTO knowledge_entries (
            id, title, type, content, body, summary, scope, repo, domain, tags, embedding, created_at, updated_at,
            confidence, url, metadata
          ) VALUES (
            @id, @title, @type, @content, @body, @summary, @scope, @repo, @domain, @tags, @embedding, @createdAt,
            @updatedAt, @confidence, @url, @metadata
          )
        `,
      )
      .run({
        id: entry.id,
        title: entry.title,
        type: entry.type,
        content: entry.content,
        body: JSON.stringify(entry.body),
        summary: entry.summary,
        scope: entry.scope,
        repo: entry.repo,
        domain: entry.domain,
        tags: serializeTags(entry.tags),
        embedding: entry.embedding ? JSON.stringify(entry.embedding) : null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        confidence: entry.confidence,
        url: entry.url ?? null,
        metadata: JSON.stringify(entry.metadata),
      });

    return entry;
  }

  private findEntryByIdentity(
    title: string,
    type: string,
    scope: string,
    repo: string | null,
    domain: string | null,
  ): KnowledgeEntry | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM knowledge_entries
        WHERE lower(title) = lower(?)
          AND type = ?
          AND scope = ?
          AND COALESCE(repo, '') = COALESCE(?, '')
          AND COALESCE(domain, '') = COALESCE(?, '')
        LIMIT 1
      `,
      )
      .get(title, type, scope, repo, domain) as KnowledgeRow | undefined;

    return row ? mapRowToEntry(row) : null;
  }

  private findSingleEntryByPortableIdentity(
    title: string,
    type: string,
    repo: string | null,
    domain: string | null,
  ): KnowledgeEntry | null {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM knowledge_entries
        WHERE lower(title) = lower(?)
          AND type = ?
          AND (COALESCE(repo, '') = COALESCE(?, '') OR repo IS NULL OR ? IS NULL)
          AND (COALESCE(domain, '') = COALESCE(?, '') OR domain IS NULL OR ? IS NULL)
        LIMIT 2
      `,
      )
      .all(title, type, repo, repo, domain, domain) as KnowledgeRow[];

    return rows.length === 1 ? mapRowToEntry(rows[0]!) : null;
  }

  private updateEntryById(id: string, input: ParsedKnowledgeEntryInput): KnowledgeEntry {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        UPDATE knowledge_entries
        SET title = @title,
            type = @type,
            content = @content,
            body = @body,
            summary = @summary,
            scope = @scope,
            repo = @repo,
            domain = @domain,
            tags = @tags,
            embedding = @embedding,
            confidence = @confidence,
            url = @url,
            metadata = @metadata,
            updated_at = @updatedAt
        WHERE id = @id
      `,
      )
      .run({
        id,
        title: input.title,
        type: input.type,
        content: input.content,
        body: JSON.stringify(input.body.length > 0 ? input.body : contentToBody(input.content)),
        summary: input.summary ?? null,
        scope: input.scope,
        repo: input.repo ?? null,
        domain: input.domain ?? null,
        tags: serializeTags(input.tags),
        embedding: input.embedding ? JSON.stringify(input.embedding) : null,
        confidence: input.confidence,
        url: input.url ?? null,
        metadata: JSON.stringify(input.metadata),
        updatedAt: now,
      });

    return this.getEntryById(id)!;
  }

  getEntryById(id: string): KnowledgeEntry | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_entries WHERE id = ?")
      .get(id) as KnowledgeRow | undefined;

    return row ? mapRowToEntry(row) : null;
  }

  listEntries(filters: Partial<KnowledgeListFilters> = {}): KnowledgeEntry[] {
    const parsedFilters = knowledgeListFiltersSchema.parse(filters);
    const { clause, params } = buildWhereClause(parsedFilters);
    const rows = this.db
      .prepare(
        `
          SELECT * FROM knowledge_entries
          ${clause}
          ORDER BY updated_at DESC
          LIMIT @limit
        `,
      )
      .all({
        ...params,
        limit: parsedFilters.limit,
      }) as KnowledgeRow[];

    return rows.map(mapRowToEntry);
  }

  searchEntries(
    queryEmbedding: number[],
    filters: Partial<KnowledgeSearchFilters> = {},
  ): RankedKnowledgeEntry[] {
    const parsedFilters = knowledgeSearchFiltersSchema.parse(filters);
    const candidateLimit = Math.max(parsedFilters.limit, 200);
    const candidates = this.listEntries({
      repo: parsedFilters.repo,
      domain: parsedFilters.domain,
      limit: candidateLimit,
    });

    return rankEntriesBySimilarity(candidates, queryEmbedding).slice(0, parsedFilters.limit);
  }

  searchEntriesByText(
    query: string,
    filters: Partial<KnowledgeSearchFilters> = {},
  ): RankedKnowledgeEntry[] {
    const parsedFilters = knowledgeSearchFiltersSchema.parse({
      ...filters,
      query,
    });
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

  resolveContext(queryEmbedding: number[], input: ResolveContextInput): RankedKnowledgeEntry[] {
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
      rankEntriesBySimilarity(candidates, queryEmbedding),
      parsedInput.repo,
      parsedInput.domain,
    ).slice(0, parsedInput.limit);
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
}
