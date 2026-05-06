import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { resetDatabase } from "../db/database.js";
import { MemoryService } from "../services/memoryService.js";
import { startPreviewServer } from "../server/previewServer.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

const withTempProject = async (callback: (tempDir: string) => Promise<void>): Promise<void> => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowit-preview-"));
  const originalCwd = process.cwd();
  const originalScope = process.env.KNOWIT_STORAGE_SCOPE;
  const originalPath = process.env.KNOWIT_DB_PATH;

  try {
    delete process.env.KNOWIT_STORAGE_SCOPE;
    delete process.env.KNOWIT_DB_PATH;
    process.chdir(tempDir);
    resetDatabase();
    await callback(tempDir);
  } finally {
    process.chdir(originalCwd);
    resetDatabase();
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

const listenOnRandomPort = async (): Promise<{ port: number; server: http.Server }> => {
  const server = http.createServer((_request, response) => {
    response.end("occupied");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(typeof address === "object" && address);
  return { port: address.port, server };
};

test("preview server exposes project JSONL entries and blocks writes", async () => {
  await withTempProject(async (tempDir) => {
    const service = new MemoryService();
    const stored = await service.storeKnowledge({
      title: "Preview reads JSONL",
      type: "decision",
      content: "The local preview reads project-scoped JSONL knowledge.",
      body: [{ type: "paragraph", text: "The local preview reads project-scoped JSONL knowledge." }],
      scope: "repo",
      repo: "knowit",
      domain: "cli",
      tags: ["preview", "jsonl"],
      confidence: 0.96,
      metadata: {},
    });
    const preview = await startPreviewServer({ openBrowser: false, port: 0 });

    try {
      const meta = await fetch(`${preview.url}/api/meta`);
      assert.equal(meta.status, 200);
      const metaBody = (await meta.json()) as {
        packageVersion: string;
        sourceId: string;
        sourceKind: string;
        sourceName: string;
        storagePath: string;
        storageScope: string;
      };
      assert.deepEqual(
        {
          ...metaBody,
          storagePath: fs.realpathSync(path.dirname(metaBody.storagePath)) + path.sep + path.basename(metaBody.storagePath),
        },
        {
          packageVersion: packageJson.version,
        sourceId: "local",
        sourceKind: "jsonl",
        sourceName: "Local JSONL",
          storagePath: fs.realpathSync(path.join(tempDir, ".knowit")) + path.sep + "knowledge.jsonl",
        storageScope: "project",
        },
      );

      const entries = await fetch(`${preview.url}/api/entries?q=preview&type=decision&tag=jsonl`);
      assert.equal(entries.status, 200);
      const entryList = (await entries.json()) as Array<{ id: string; title: string }>;
      assert.equal(entryList.length, 1);
      assert.equal(entryList[0]?.title, "Preview reads JSONL");

      const entry = await fetch(`${preview.url}/api/entries/${stored.id}`);
      assert.equal(entry.status, 200);
      assert.equal(((await entry.json()) as { id: string }).id, stored.id);

      const writeAttempt = await fetch(`${preview.url}/api/entries`, { method: "POST" });
      assert.equal(writeAttempt.status, 405);

      const favicon = await fetch(`${preview.url}/favicon.ico`);
      assert.equal(favicon.status, 204);
    } finally {
      await preview.close();
    }
  });
});

test("preview server reads custom SQLite storage", async () => {
  await withTempProject(async (tempDir) => {
    process.env.KNOWIT_STORAGE_SCOPE = "custom";
    process.env.KNOWIT_DB_PATH = path.join(tempDir, "custom", "knowit.db");
    resetDatabase();

    const service = new MemoryService();
    await service.storeKnowledge({
      title: "Preview reads SQLite",
      type: "note",
      content: "The local preview can inspect custom SQLite memory.",
      scope: "global",
      tags: ["preview", "sqlite"],
      confidence: 1,
      metadata: {},
    });
    const preview = await startPreviewServer({ openBrowser: false, port: 0 });

    try {
      const meta = await fetch(`${preview.url}/api/meta`);
      assert.equal(meta.status, 200);
      const metaBody = (await meta.json()) as { sourceKind: string; storageScope: string };
      assert.equal(metaBody.sourceKind, "sqlite");
      assert.equal(metaBody.storageScope, "custom");

      const entries = await fetch(`${preview.url}/api/entries?type=note&tag=sqlite`);
      assert.equal(entries.status, 200);
      const entryList = (await entries.json()) as Array<{ title: string }>;
      assert.equal(entryList.length, 1);
      assert.equal(entryList[0]?.title, "Preview reads SQLite");
    } finally {
      await preview.close();
    }
  });
});

test("preview server falls back when the requested port is occupied", async () => {
  const occupied = await listenOnRandomPort();
  const preview = await startPreviewServer({
    host: "127.0.0.1",
    openBrowser: false,
    port: occupied.port,
  });

  try {
    assert.notEqual(preview.port, occupied.port);
    const response = await fetch(preview.url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Knowit Preview/);
  } finally {
    await preview.close();
    await new Promise<void>((resolve, reject) => {
      occupied.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
