import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { getDatabasePath, getStorageScope, initializeDatabase, resetDatabase } from "../db/database.js";
import { KnowledgeRepository } from "../db/knowledgeRepo.js";
import { SourceRepository } from "../db/sourceRepo.js";
import { SqliteMemorySource } from "../sources/sqliteSource.js";
import { MemoryService } from "../services/memoryService.js";
import { storeKnowledgeInputSchema } from "../types/knowledge.js";
import type { KnowledgeSource } from "../types/source.js";

const createTestDatabase = (): {
  cleanup: () => void;
  database: Database.Database;
} => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-test-"));
  const databasePath = path.join(tempDir, "knowit.db");
  const database = new Database(databasePath);
  initializeDatabase(database);

  return {
    database,
    cleanup: () => {
      database.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
};

const fakeEmbeddingGenerator = async (text: string): Promise<number[]> => {
  const normalized = text.toLowerCase();
  return [
    normalized.includes("stripe") ? 1 : 0,
    normalized.includes("retry") ? 1 : 0,
    normalized.includes("architecture") ? 1 : 0,
  ];
};

const failingEmbeddingGenerator = async (): Promise<number[]> => {
  throw new Error("embeddings unavailable");
};

const localSource: KnowledgeSource = {
  id: "local",
  name: "Local SQLite",
  kind: "sqlite",
  isDefault: true,
  config: { mode: "sqlite" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test("local sqlite source stores, lists, searches, and resolves knowledge", async () => {
  const { database, cleanup } = createTestDatabase();

  try {
    const knowledgeRepository = new KnowledgeRepository(database);
    const source = new SqliteMemorySource(localSource, knowledgeRepository, fakeEmbeddingGenerator);

    const storedPattern = await source.storeKnowledge({
      type: "pattern",
      title: "Stripe webhook idempotency",
      content: "Always use the event ID for retry-safe idempotency.",
      scope: "repo",
      repo: "payments-api",
      domain: "billing",
      tags: ["stripe", "webhooks"],
      confidence: 0.9,
      metadata: {},
      source: "local",
    });

    const storedRule = await source.storeKnowledge({
      type: "rule",
      title: "Retry state verification",
      content: "Before retrying a payment, verify server state.",
      scope: "repo",
      repo: "payments-api",
      domain: "billing",
      tags: ["payments", "retry"],
      confidence: 1,
      metadata: {},
      source: "local",
    });

    const listedEntries = await source.listKnowledge({
      repo: "payments-api",
      limit: 10,
    });

    assert.equal(listedEntries.length, 2);
    assert.equal(listedEntries[0]?.repo, "payments-api");

    const searchResults = await source.searchKnowledge({
      query: "stripe retry",
      repo: "payments-api",
      domain: "billing",
      limit: 5,
    });

    assert.equal(searchResults.length, 2);
    assert.equal(searchResults[0]?.title, storedPattern.title);
    assert.equal(searchResults[0]?.sourceId, "local");
    assert.ok((searchResults[0]?.score ?? 0) >= (searchResults[1]?.score ?? 0));

    const contextResults = await source.resolveContext({
      task: "implement stripe retry logic",
      repo: "payments-api",
      domain: "billing",
      files: ["src/payments/retry.ts"],
      limit: 5,
      source: "local",
    });

    assert.equal(contextResults.length, 2);
    assert.equal(contextResults[0]?.repo, "payments-api");
    assert.ok(
      contextResults.some((item) => item.id === storedPattern.id),
      "expected stripe pattern in resolved context",
    );
    assert.ok(
      contextResults.some((item) => item.id === storedRule.id),
      "expected retry rule in resolved context",
    );
  } finally {
    cleanup();
  }
});

test("source repository ensures local source and stores MCP-backed sources", () => {
  const { database, cleanup } = createTestDatabase();

  try {
    const sourceRepository = new SourceRepository(database);
    sourceRepository.init();

    const local = sourceRepository.ensureLocalSource();
    assert.equal(local.id, "local");
    assert.equal(local.kind, "sqlite");

    const remote = sourceRepository.createMcpSource({
      name: "notion-memory",
      command: "node",
      args: ["notion-server.js"],
      env: { NOTION_TOKEN: "test-token" },
      toolMap: {
        store: "store_page",
        search: "search_pages",
        resolve: "resolve_notes",
      },
      isDefault: false,
    });

    assert.equal(remote.kind, "mcp");
    assert.equal(remote.config.mode, "mcp");
    assert.equal(remote.config.command, "node");
    assert.deepEqual(remote.config.args, ["notion-server.js"]);
    assert.equal(remote.config.toolMap.store, "store_page");

    const sources = sourceRepository.listSources();
    assert.equal(sources.length, 2);
    assert.equal(sourceRepository.getDefaultSource().id, "local");
  } finally {
    cleanup();
  }
});

test("connecting notion creates a routed source with provider guidance", () => {
  const { database, cleanup } = createTestDatabase();

  try {
    const sourceRepository = new SourceRepository(database);
    sourceRepository.init();
    sourceRepository.ensureLocalSource();

    const notion = sourceRepository.connectKnownSource({
      provider: "notion",
      mcpServerName: "notion",
      isDefault: false,
    });

    assert.equal(notion.kind, "route");
    assert.equal(notion.config.mode, "route");
    assert.equal(notion.config.provider, "notion");
    assert.equal(notion.config.mcpServerName, "notion");
    assert.match(notion.config.setupHint, /Notion MCP server/i);
    assert.match(notion.config.readHint, /Notion MCP server/i);
    assert.match(notion.config.writeHint, /Notion MCP server/i);
  } finally {
    cleanup();
  }
});

test("local sqlite source stores and retrieves knowledge without embeddings", async () => {
  const { database, cleanup } = createTestDatabase();

  try {
    const knowledgeRepository = new KnowledgeRepository(database);
    const source = new SqliteMemorySource(localSource, knowledgeRepository, failingEmbeddingGenerator);

    const entry = await source.storeKnowledge({
      type: "architecture",
      title: "Knowit source orchestration",
      content: "Knowit routes memory operations to source providers through MemoryService.",
      scope: "repo",
      repo: "knowit",
      domain: "architecture",
      tags: ["knowit", "mcp", "architecture"],
      confidence: 1,
      metadata: {},
      source: "local",
    });

    assert.equal(entry.embedding, null);

    const searchResults = await source.searchKnowledge({
      query: "source orchestration",
      repo: "knowit",
      domain: "architecture",
      limit: 5,
    });

    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0]?.title, "Knowit source orchestration");

    const contextResults = await source.resolveContext({
      task: "add a source provider",
      repo: "knowit",
      domain: "architecture",
      files: [],
      limit: 5,
      source: "local",
    });

    assert.equal(contextResults.length, 1);
    assert.equal(contextResults[0]?.id, entry.id);
  } finally {
    cleanup();
  }
});

test("database path defaults to a project-local .knowit directory", () => {
  const originalScope = process.env.KNOWIT_STORAGE_SCOPE;
  const originalPath = process.env.KNOWIT_DB_PATH;

  delete process.env.KNOWIT_STORAGE_SCOPE;
  delete process.env.KNOWIT_DB_PATH;

  try {
    const projectRoot = "/tmp/knowit-project";
    assert.equal(getStorageScope(), "project");
    assert.equal(getDatabasePath(projectRoot), path.join(projectRoot, ".knowit", "knowit.db"));
  } finally {
    if (originalScope === undefined) {
      delete process.env.KNOWIT_STORAGE_SCOPE;
    } else {
      process.env.KNOWIT_STORAGE_SCOPE = originalScope;
    }

    if (originalPath === undefined) {
      delete process.env.KNOWIT_DB_PATH;
    } else {
      process.env.KNOWIT_DB_PATH = originalPath;
    }
  }
});

test("database path supports global and custom storage scopes", () => {
  const originalScope = process.env.KNOWIT_STORAGE_SCOPE;
  const originalPath = process.env.KNOWIT_DB_PATH;

  try {
    process.env.KNOWIT_STORAGE_SCOPE = "global";
    delete process.env.KNOWIT_DB_PATH;
    assert.equal(getStorageScope(), "global");
    assert.equal(getDatabasePath("/tmp/ignored"), path.join(os.homedir(), ".knowit", "knowit.db"));

    process.env.KNOWIT_STORAGE_SCOPE = "custom";
    process.env.KNOWIT_DB_PATH = "shared/knowit.db";
    assert.equal(getStorageScope(), "custom");
    assert.equal(getDatabasePath("/workspace/app"), "/workspace/app/shared/knowit.db");
  } finally {
    if (originalScope === undefined) {
      delete process.env.KNOWIT_STORAGE_SCOPE;
    } else {
      process.env.KNOWIT_STORAGE_SCOPE = originalScope;
    }

    if (originalPath === undefined) {
      delete process.env.KNOWIT_DB_PATH;
    } else {
      process.env.KNOWIT_DB_PATH = originalPath;
    }
  }
});

test("storing an entry with the same logical identity updates it instead of creating a duplicate", async () => {
  const { database, cleanup } = createTestDatabase();

  try {
    const knowledgeRepository = new KnowledgeRepository(database);
    const source = new SqliteMemorySource(localSource, knowledgeRepository, failingEmbeddingGenerator);

    const first = await source.storeKnowledge({
      type: "rule",
      title: "API error handling",
      content: "Always return 4xx for client errors and 5xx for server errors.",
      scope: "repo",
      repo: "api-gateway",
      domain: null,
      tags: ["errors", "http"],
      confidence: 0.8,
      metadata: {},
      source: "local",
    });

    const second = await source.storeKnowledge({
      type: "rule",
      title: "API error handling",
      content: "Return 4xx for client errors, 5xx for server errors, and always include an error code in the body.",
      scope: "repo",
      repo: "api-gateway",
      domain: null,
      tags: ["errors", "http", "json"],
      confidence: 1,
      metadata: {},
      source: "local",
    });

    assert.equal(first.id, second.id, "same logical entry should keep its original id");
    assert.equal(
      second.content,
      "Return 4xx for client errors, 5xx for server errors, and always include an error code in the body.",
      "content should be updated",
    );
    assert.deepEqual(second.tags, ["errors", "http", "json"], "tags should be updated");
    assert.equal(second.confidence, 1, "confidence should be updated");

    const allEntries = await source.listKnowledge({ repo: "api-gateway", limit: 10 });
    assert.equal(allEntries.length, 1, "no duplicate should be created");
  } finally {
    cleanup();
  }
});

test("repo and domain scoped knowledge requires routing metadata", () => {
  assert.throws(
    () =>
      storeKnowledgeInputSchema.parse({
        title: "Missing repo",
        type: "note",
        content: "This should fail.",
        scope: "repo",
      }),
    /repo is required when scope is repo or domain/,
  );

  assert.throws(
    () =>
      storeKnowledgeInputSchema.parse({
        title: "Missing domain",
        type: "note",
        content: "This should also fail.",
        scope: "domain",
        repo: "knowit",
      }),
    /domain is required when scope is domain/,
  );
});

test("resolveSourceAction returns direct local guidance for local source", async () => {
  const { cleanup } = createTestDatabase();
  const originalPath = process.env.KNOWIT_DB_PATH;

  try {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-action-local-"));
    process.env.KNOWIT_DB_PATH = path.join(tempDir, "knowit.db");
    resetDatabase();
    const service = new MemoryService();
    service.init();

    await service.storeKnowledge({
      source: "local",
      type: "decision",
      title: "Auth decision",
      content: "Use stateless JWT auth for API clients.",
      scope: "repo",
      repo: "api-gateway",
      domain: "auth",
      tags: ["auth"],
      confidence: 1,
      metadata: {},
    });

    const result = await service.resolveSourceAction({
      action: "read",
      artifactType: "decision",
      source: "local",
      query: "auth decision",
      repo: "api-gateway",
      domain: "auth",
    });

    assert.equal(result.mode, "local");
    assert.equal(result.shouldUseKnowitDirectly, true);
    assert.equal(result.sourceId, "local");
    assert.equal(result.relevantKnowledge.length, 1);
  } finally {
    resetDatabase();
    if (originalPath === undefined) {
      delete process.env.KNOWIT_DB_PATH;
    } else {
      process.env.KNOWIT_DB_PATH = originalPath;
    }
    cleanup();
  }
});

test("resolveSourceAction returns routed guidance for notion source", async () => {
  const { cleanup } = createTestDatabase();
  const originalPath = process.env.KNOWIT_DB_PATH;

  try {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-action-route-"));
    process.env.KNOWIT_DB_PATH = path.join(tempDir, "knowit.db");
    resetDatabase();
    const service = new MemoryService();
    service.init();
    service.connectKnownSource({
      provider: "notion",
      mcpServerName: "notion",
      isDefault: false,
    });

    const result = await service.resolveSourceAction({
      action: "write",
      artifactType: "prd",
      source: "notion",
      title: "Feature PRD",
      repo: "knowit",
      domain: "product",
    });

    assert.equal(result.mode, "route");
    assert.equal(result.shouldUseKnowitDirectly, false);
    assert.equal(result.mcpServerName, "notion");
    assert.equal(result.provider, "notion");
    assert.equal(result.storeDistilledMemory, true);
    assert.match(result.nextStep, /notion MCP/i);
  } finally {
    resetDatabase();
    if (originalPath === undefined) {
      delete process.env.KNOWIT_DB_PATH;
    } else {
      process.env.KNOWIT_DB_PATH = originalPath;
    }
    cleanup();
  }
});
