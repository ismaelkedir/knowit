import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getDatabase, initializeDatabase } from "./database.js";
import {
  createMcpSourceInputSchema,
  knowledgeSourceSchema,
  type CreateMcpSourceInput,
  type KnowledgeSource,
  type SourceConfig,
} from "../types/source.js";

interface SourceRow {
  id: string;
  name: string;
  kind: string;
  config: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

const mapRowToSource = (row: SourceRow): KnowledgeSource =>
  knowledgeSourceSchema.parse({
    id: row.id,
    name: row.name,
    kind: row.kind,
    config: JSON.parse(row.config) as SourceConfig,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export class SourceRepository {
  private readonly db: Database.Database;

  constructor(database: Database.Database = getDatabase()) {
    this.db = database;
  }

  init(): void {
    initializeDatabase(this.db);
  }

  ensureLocalSource(): KnowledgeSource {
    const existing = this.getSourceById("local");
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
          INSERT INTO knowledge_sources (id, name, kind, config, is_default, created_at, updated_at)
          VALUES (@id, @name, @kind, @config, @isDefault, @createdAt, @updatedAt)
        `,
      )
      .run({
        id: "local",
        name: "Local SQLite",
        kind: "sqlite",
        config: JSON.stringify({ mode: "sqlite" }),
        isDefault: 1,
        createdAt: now,
        updatedAt: now,
      });

    return this.getSourceById("local") as KnowledgeSource;
  }

  createMcpSource(input: CreateMcpSourceInput): KnowledgeSource {
    const parsed = createMcpSourceInputSchema.parse(input);
    const id = toSlug(parsed.name) || randomUUID();
    const now = new Date().toISOString();

    if (parsed.isDefault) {
      this.clearDefaultSource();
    }

    this.db
      .prepare(
        `
          INSERT INTO knowledge_sources (id, name, kind, config, is_default, created_at, updated_at)
          VALUES (@id, @name, @kind, @config, @isDefault, @createdAt, @updatedAt)
        `,
      )
      .run({
        id,
        name: parsed.name,
        kind: "mcp",
        config: JSON.stringify({
          mode: "mcp",
          transport: "stdio",
          command: parsed.command,
          args: parsed.args,
          cwd: parsed.cwd,
          env: parsed.env,
          toolMap: parsed.toolMap,
        }),
        isDefault: parsed.isDefault ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });

    return this.getSourceById(id) as KnowledgeSource;
  }

  listSources(): KnowledgeSource[] {
    const rows = this.db
      .prepare("SELECT * FROM knowledge_sources ORDER BY is_default DESC, name ASC")
      .all() as SourceRow[];

    return rows.map(mapRowToSource);
  }

  getDefaultSource(): KnowledgeSource {
    const row = this.db
      .prepare("SELECT * FROM knowledge_sources WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1")
      .get() as SourceRow | undefined;

    if (row) {
      return mapRowToSource(row);
    }

    return this.ensureLocalSource();
  }

  getSourceById(id: string): KnowledgeSource | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_sources WHERE id = ?")
      .get(id) as SourceRow | undefined;

    return row ? mapRowToSource(row) : null;
  }

  private clearDefaultSource(): void {
    this.db.prepare("UPDATE knowledge_sources SET is_default = 0 WHERE is_default = 1").run();
  }
}
