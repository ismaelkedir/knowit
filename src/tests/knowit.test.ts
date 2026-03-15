import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { initializeDatabase } from "../db/database.js";
import { KnowledgeRepository } from "../db/knowledgeRepo.js";
import { SourceRepository } from "../db/sourceRepo.js";
import { SqliteMemorySource } from "../sources/sqliteSource.js";
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
