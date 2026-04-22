import test from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../server/tools.js";

type ToolHandler = (input: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

class FakeServer {
  handlers = new Map<string, ToolHandler>();

  tool(name: string, ...args: unknown[]): void {
    const handler = args[args.length - 1];
    if (typeof handler !== "function") {
      throw new Error(`Expected handler for tool ${name}`);
    }
    this.handlers.set(name, handler as ToolHandler);
  }
}

test("capture_session_learnings reports partial success when some entries fail", async () => {
  const server = new FakeServer();
  const memoryService = {
    listSources() {
      return [];
    },
    registerMcpSource() {
      throw new Error("not implemented");
    },
    connectKnownSource() {
      throw new Error("not implemented");
    },
    async storeKnowledge(input: { title: string; type: string }) {
      if (input.title === "Bad entry") {
        throw new Error("embedding provider unavailable");
      }

      return {
        id: "ok-1",
        title: input.title,
        type: input.type,
        content: "stored",
        summary: null,
        scope: "global",
        repo: null,
        domain: null,
        tags: [],
        embedding: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1,
        url: null,
        metadata: {},
      };
    },
    async searchKnowledge() {
      return [];
    },
    async resolveContext() {
      return [];
    },
    async listKnowledge() {
      return [];
    },
    async getKnowledge() {
      return [];
    },
    async resolveSourceAction() {
      throw new Error("not implemented");
    },
  };

  registerTools(server as unknown as McpServer, memoryService as never, true);

  const handler = server.handlers.get("capture_session_learnings");
  assert.ok(handler);

  const result = await handler!({
    learnings: [
      {
        title: "Good entry",
        type: "note",
        content: "kept",
        scope: "global",
        tags: [],
        confidence: 1,
      },
      {
        title: "Bad entry",
        type: "note",
        content: "fails",
        scope: "global",
        tags: [],
        confidence: 1,
      },
    ],
  });

  const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
    stored?: number;
    failed?: number;
    entries?: Array<{ title: string }>;
    failures?: Array<{ title: string; reason: string }>;
  };

  assert.equal(payload.stored, 1);
  assert.equal(payload.failed, 1);
  assert.deepEqual(payload.entries, [{ id: "ok-1", title: "Good entry" }]);
  assert.equal(payload.failures?.[0]?.title, "Bad entry");
  assert.match(payload.failures?.[0]?.reason ?? "", /embedding provider unavailable/);
});
