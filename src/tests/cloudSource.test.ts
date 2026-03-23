import test from "node:test";
import assert from "node:assert/strict";
import { CloudMemorySource } from "../sources/cloudSource.js";
import type { KnowledgeSource } from "../types/source.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const testCloudSource: KnowledgeSource = {
  id: "cloud",
  name: "Knowit Cloud",
  kind: "cloud",
  isDefault: false,
  config: { mode: "cloud", apiUrl: "https://test.useknowit.dev", token: "ki_live_testtoken" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "e1", title: "Test entry", type: "rule", content: "Content.", scope: "global",
  repo: null, domain: null, tags: [], embedding: null, confidence: 1,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  url: null, metadata: {}, ...overrides,
});

/** Simulates a successful API response for a given payload. */
const okResponse = (payload: unknown) =>
  new Response(JSON.stringify({ result: { data: { json: payload } } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const errorResponse = (status: number) =>
  new Response(JSON.stringify({}), { status });

type FetchCall = { url: string; method: string; headers: Record<string, string> };

const withFetch = async (
  respond: (url: string) => Response,
  fn: (source: CloudMemorySource, calls: FetchCall[]) => Promise<void>,
  source: CloudMemorySource = new CloudMemorySource(testCloudSource),
) => {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: input.toString(),
      method: (init?.method ?? "GET").toUpperCase(),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return respond(input.toString());
  };
  try {
    await fn(source, calls);
  } finally {
    globalThis.fetch = original;
  }
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

test("CloudMemorySource attaches Bearer token to every request", async () => {
  await withFetch(() => okResponse(makeEntry()), async (source, calls) => {
    await source.storeKnowledge({
      type: "rule", title: "Test", content: "c", scope: "global",
      tags: [], confidence: 1, metadata: {},
    });
    assert.equal(calls[0]?.headers["Authorization"], "Bearer ki_live_testtoken");
  });
});

test("CloudMemorySource uses the configured apiUrl", async () => {
  const customSource: KnowledgeSource = {
    ...testCloudSource,
    config: { mode: "cloud", apiUrl: "https://custom.example.com", token: "ki_live_custom" },
  };
  await withFetch(() => okResponse([]), async (_source, calls) => {
    await _source.listKnowledge({ limit: 5 });
    assert.ok(calls[0]?.url.startsWith("https://custom.example.com"));
  }, new CloudMemorySource(customSource));
});

// ─── HTTP methods ─────────────────────────────────────────────────────────────

test("CloudMemorySource.storeKnowledge uses POST", async () => {
  await withFetch(() => okResponse(makeEntry()), async (source, calls) => {
    await source.storeKnowledge({
      type: "rule", title: "Test", content: "c", scope: "global",
      tags: [], confidence: 1, metadata: {},
    });
    assert.equal(calls[0]?.method, "POST");
  });
});

test("CloudMemorySource.searchKnowledge uses POST", async () => {
  await withFetch(() => okResponse([]), async (source, calls) => {
    await source.searchKnowledge({ query: "test", limit: 5 });
    assert.equal(calls[0]?.method, "POST");
  });
});

test("CloudMemorySource.resolveContext uses POST", async () => {
  await withFetch(() => okResponse([]), async (source, calls) => {
    await source.resolveContext({ task: "test", files: [], limit: 5 });
    assert.equal(calls[0]?.method, "POST");
  });
});

test("CloudMemorySource.listKnowledge uses GET", async () => {
  await withFetch(() => okResponse([]), async (source, calls) => {
    await source.listKnowledge({ limit: 5 });
    assert.equal(calls[0]?.method, "GET");
  });
});

test("CloudMemorySource.getKnowledge uses GET", async () => {
  await withFetch(() => okResponse([makeEntry()]), async (source, calls) => {
    await source.getKnowledge!(["e1"]);
    assert.equal(calls[0]?.method, "GET");
  });
});

// ─── Response mapping ─────────────────────────────────────────────────────────

test("CloudMemorySource.searchKnowledge decorates results with source metadata", async () => {
  const raw = [{ ...makeEntry({ id: "r1", score: 0.9 }), summary: "Short summary." }];
  await withFetch(() => okResponse(raw), async (source) => {
    const results = await source.searchKnowledge({ query: "test", limit: 5 });
    assert.equal(results[0]?.sourceId, "cloud");
    assert.equal(results[0]?.sourceName, "Knowit Cloud");
    assert.equal(results[0]?.sourceKind, "cloud");
    assert.equal(results[0]?.score, 0.9);
  });
});

test("CloudMemorySource.resolveContext decorates results with source metadata", async () => {
  const raw = [{ ...makeEntry({ id: "r2", score: 0.8 }), summary: "Short summary." }];
  await withFetch(() => okResponse(raw), async (source) => {
    const results = await source.resolveContext({ task: "test", files: [], limit: 5 });
    assert.equal(results[0]?.sourceId, "cloud");
    assert.equal(results[0]?.sourceKind, "cloud");
  });
});

test("CloudMemorySource.getKnowledge returns full entries including content", async () => {
  const entry = makeEntry({ id: "e3", content: "Full content here." });
  await withFetch(() => okResponse([entry]), async (source) => {
    const results = await source.getKnowledge!(["e3"]);
    assert.equal(results[0]?.content, "Full content here.");
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

test("CloudMemorySource throws on non-ok HTTP response", async () => {
  await withFetch(() => errorResponse(401), async (source) => {
    await assert.rejects(
      () => source.searchKnowledge({ query: "test", limit: 5 }),
      /Knowit Cloud API error 401/,
    );
  });
});

test("CloudMemorySource throws on 5xx server error", async () => {
  await withFetch(() => errorResponse(500), async (source) => {
    await assert.rejects(
      () => source.listKnowledge({ limit: 5 }),
      /Knowit Cloud API error 500/,
    );
  });
});
