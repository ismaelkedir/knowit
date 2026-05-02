import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getJsonlSourcesPath } from "../db/database.js";
import {
  connectKnownSourceInputSchema,
  createMcpSourceInputSchema,
  knowledgeSourceSchema,
  type ConnectKnownSourceInput,
  type CreateMcpSourceInput,
  type KnowledgeSource,
} from "../types/source.js";
import { readSqliteSources, writeSourcesJson } from "./sqliteToJsonlMigration.js";

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export class JsonlSourceRepository {
  constructor(private readonly filePath: string = getJsonlSourcesPath()) {}

  init(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const migrated = this.migrateLegacyProjectDatabase();
      if (!migrated) {
        this.writeSources([]);
      }
    }
  }

  ensureLocalSource(): KnowledgeSource {
    const existing = this.getSourceById("local");
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const source = knowledgeSourceSchema.parse({
      id: "local",
      name: "Local JSONL",
      kind: "jsonl",
      isDefault: true,
      config: { mode: "jsonl" },
      createdAt: now,
      updatedAt: now,
    });

    this.writeSources([source, ...this.readSources()]);
    return source;
  }

  createMcpSource(input: CreateMcpSourceInput): KnowledgeSource {
    const parsed = createMcpSourceInputSchema.parse(input);
    const id = toSlug(parsed.name) || randomUUID();
    const now = new Date().toISOString();
    const sources = parsed.isDefault ? this.clearDefault(this.readSources()) : this.readSources();
    const source = knowledgeSourceSchema.parse({
      id,
      name: parsed.name,
      kind: "mcp",
      config: {
        mode: "mcp",
        transport: "stdio",
        command: parsed.command,
        args: parsed.args,
        cwd: parsed.cwd,
        env: parsed.env,
        toolMap: parsed.toolMap,
      },
      isDefault: parsed.isDefault,
      createdAt: now,
      updatedAt: now,
    });

    this.writeSources([source, ...sources.filter((item) => item.id !== id)]);
    return source;
  }

  connectKnownSource(input: ConnectKnownSourceInput): KnowledgeSource {
    const parsed = connectKnownSourceInputSchema.parse(input);

    if (parsed.provider === "local") {
      const local = this.ensureLocalSource();
      if (parsed.isDefault) {
        this.setDefaultSource(local.id);
      }
      return this.getSourceById(local.id) as KnowledgeSource;
    }

    const routedSource = this.upsertRouteSource(parsed.provider, {
      mcpServerName: parsed.mcpServerName ?? "notion",
      setupHint:
        "Ensure the Notion MCP server is installed in the AI client. Knowit does not install or control the Notion MCP yet.",
      readHint:
        "Use the Notion MCP server to search or read the canonical document after first checking Knowit for routing context.",
      writeHint:
        "Use the Notion MCP server to create or update the canonical artifact in Notion, then optionally store distilled memory back in Knowit.",
    });

    if (parsed.isDefault) {
      this.setDefaultSource(routedSource.id);
      return this.getSourceById(routedSource.id) as KnowledgeSource;
    }

    return routedSource;
  }

  listSources(): KnowledgeSource[] {
    return this.readSources().sort((left, right) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }

  getDefaultSource(): KnowledgeSource {
    return this.readSources().find((source) => source.isDefault) ?? this.ensureLocalSource();
  }

  getSourceById(id: string): KnowledgeSource | null {
    return this.readSources().find((source) => source.id === id) ?? null;
  }

  removeSource(id: string): void {
    this.writeSources(this.readSources().filter((source) => source.id !== id));
  }

  setDefaultSource(id: string): void {
    const now = new Date().toISOString();
    this.writeSources(
      this.readSources().map((source) => ({
        ...source,
        isDefault: source.id === id,
        updatedAt: source.id === id ? now : source.updatedAt,
      })),
    );
  }

  upsertSyntheticSource(input: {
    id: string;
    name: string;
    kind: string;
    isDefault: boolean;
    config: Record<string, unknown>;
  }): void {
    const now = new Date().toISOString();
    const sources = input.isDefault ? this.clearDefault(this.readSources()) : this.readSources();
    const existing = sources.find((source) => source.id === input.id);
    const source = knowledgeSourceSchema.parse({
      id: input.id,
      name: input.name,
      kind: input.kind,
      config: input.config,
      isDefault: input.isDefault,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    this.writeSources([source, ...sources.filter((item) => item.id !== input.id)]);
  }

  private upsertRouteSource(
    provider: Exclude<ConnectKnownSourceInput["provider"], "local">,
    hints: {
      mcpServerName: string;
      setupHint: string;
      readHint: string;
      writeHint: string;
    },
  ): KnowledgeSource {
    const id = provider;
    const now = new Date().toISOString();
    const sources = this.readSources();
    const existing = sources.find((source) => source.id === id);
    const source = knowledgeSourceSchema.parse({
      id,
      name: provider === "notion" ? "Notion" : provider,
      kind: "route",
      isDefault: existing?.isDefault ?? false,
      config: {
        mode: "route",
        provider,
        mcpServerName: hints.mcpServerName,
        setupHint: hints.setupHint,
        readHint: hints.readHint,
        writeHint: hints.writeHint,
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    this.writeSources([source, ...sources.filter((item) => item.id !== id)]);
    return source;
  }

  private clearDefault(sources: KnowledgeSource[]): KnowledgeSource[] {
    return sources.map((source) => ({ ...source, isDefault: false }));
  }

  private readSources(): KnowledgeSource[] {
    this.init();
    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((source) => knowledgeSourceSchema.parse(source));
  }

  private writeSources(sources: KnowledgeSource[]): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
  }

  private migrateLegacyProjectDatabase(): boolean {
    const legacyPath = path.join(path.dirname(this.filePath), "knowit.db");
    if (!fs.existsSync(legacyPath)) {
      return false;
    }

    const sources = readSqliteSources(legacyPath);
    writeSourcesJson(this.filePath, sources);
    return true;
  }
}
