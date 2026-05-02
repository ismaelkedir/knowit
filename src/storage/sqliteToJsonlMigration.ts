import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  getDatabasePath,
  getJsonlKnowledgePath,
  getJsonlSourcesPath,
} from "../db/database.js";
import {
  knowledgeContentBlockSchema,
  knowledgeEntrySchema,
  type KnowledgeContentBlock,
  type KnowledgeEntry,
} from "../types/knowledge.js";
import { knowledgeSourceSchema, type KnowledgeSource } from "../types/source.js";

export interface SqliteToJsonlMigrationOptions {
  sqlitePath?: string;
  knowledgePath?: string;
  sourcesPath?: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface SqliteToJsonlMigrationResult {
  sqlitePath: string;
  knowledgePath: string;
  sourcesPath: string;
  entryCount: number;
  sourceCount: number;
  wroteKnowledge: boolean;
  wroteSources: boolean;
}

const contentToBody = (content: string): KnowledgeContentBlock[] =>
  content
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ type: "paragraph", text }));

const parseJson = (value: unknown, fallback: unknown): unknown => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  return JSON.parse(value) as unknown;
};

const parseTags = (value: unknown): string[] =>
  typeof value === "string"
    ? value.split(",").map((tag) => tag.trim()).filter(Boolean)
    : [];

const normalizeEntry = (row: Record<string, unknown>): KnowledgeEntry => {
  const content = typeof row.content === "string" ? row.content : "";
  const body = z.array(knowledgeContentBlockSchema).safeParse(parseJson(row.body, []));

  return knowledgeEntrySchema.parse({
    id: row.id,
    title: row.title,
    type: row.type,
    content,
    body: body.success && body.data.length > 0 ? body.data : contentToBody(content),
    summary: row.summary,
    scope: row.scope,
    repo: row.repo,
    domain: row.domain,
    tags: parseTags(row.tags),
    embedding: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confidence: row.confidence,
    url: row.url,
    metadata: parseJson(row.metadata, {}),
  });
};

const serializeEntry = (entry: KnowledgeEntry): string =>
  JSON.stringify({
    ...entry,
    embedding: null,
  });

export const readSqliteKnowledgeEntries = (sqlitePath: string): KnowledgeEntry[] => {
  const database = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const rows = database
      .prepare("SELECT * FROM knowledge_entries ORDER BY updated_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(normalizeEntry);
  } finally {
    database.close();
  }
};

export const readSqliteSources = (sqlitePath: string): KnowledgeSource[] => {
  const database = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const rows = database
      .prepare("SELECT * FROM knowledge_sources ORDER BY is_default DESC, name ASC")
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const config = parseJson(row.config, {});
      return knowledgeSourceSchema.parse({
        id,
        name: id === "local" ? "Local JSONL" : row.name,
        kind: id === "local" ? "jsonl" : row.kind,
        config: id === "local" ? { mode: "jsonl" } : config,
        isDefault: Boolean(row.is_default),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });
  } finally {
    database.close();
  }
};

const assertWritableTarget = (targetPath: string, force: boolean): void => {
  if (fs.existsSync(targetPath) && !force) {
    throw new Error(`${targetPath} already exists. Pass --force to overwrite it.`);
  }
};

export const writeKnowledgeJsonl = (targetPath: string, entries: KnowledgeEntry[]): void => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const text = entries.map(serializeEntry).join("\n");
  fs.writeFileSync(targetPath, text ? `${text}\n` : "", "utf8");
};

export const writeSourcesJson = (targetPath: string, sources: KnowledgeSource[]): void => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
};

export const migrateSqliteToJsonl = (
  options: SqliteToJsonlMigrationOptions = {},
): SqliteToJsonlMigrationResult => {
  const sqlitePath = options.sqlitePath ?? getDatabasePath();
  const knowledgePath = options.knowledgePath ?? getJsonlKnowledgePath();
  const sourcesPath = options.sourcesPath ?? getJsonlSourcesPath();
  const force = options.force ?? false;

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found: ${sqlitePath}`);
  }

  const entries = readSqliteKnowledgeEntries(sqlitePath);
  const sources = readSqliteSources(sqlitePath);

  if (!options.dryRun) {
    assertWritableTarget(knowledgePath, force);
    assertWritableTarget(sourcesPath, force);
    writeKnowledgeJsonl(knowledgePath, entries);
    writeSourcesJson(sourcesPath, sources);
  }

  return {
    sqlitePath,
    knowledgePath,
    sourcesPath,
    entryCount: entries.length,
    sourceCount: sources.length,
    wroteKnowledge: !options.dryRun,
    wroteSources: !options.dryRun,
  };
};
