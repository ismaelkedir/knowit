import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryService } from "../services/memoryService.js";
import { INSTRUCTIONS_WARNING } from "./instructionCheck.js";
import {
  knowledgeContentBlockSchema,
  knowledgeScopeSchema,
  knowledgeTypeSchema,
  resolveContextInputSchema,
  resolveSourceActionInputSchema,
  storeKnowledgeInputSchema,
} from "../types/knowledge.js";
import { knownSourceProviderSchema } from "../types/source.js";
import { logger } from "../utils/logger.js";

const registerMcpSourceSchema = {
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string()).default({}),
  isDefault: z.boolean().default(false),
  toolMap: z.object({
    store: z.string().optional(),
    search: z.string().optional(),
    resolve: z.string().optional(),
  }),
};

const connectSourceSchema = {
  provider: knownSourceProviderSchema,
  mcpServerName: z.string().optional(),
  isDefault: z.boolean().default(false),
};

const storeKnowledgeSchema = {
  source: z.string().optional(),
  id: z.string().min(1).optional(),
  type: knowledgeTypeSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  body: z.array(knowledgeContentBlockSchema).default([]),
  summary: z.string().max(300).optional(),
  scope: knowledgeScopeSchema.default("global"),
  repo: z.string().optional(),
  domain: z.string().optional(),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1),
  url: z.string().url().optional(),
  metadata: z.record(z.unknown()).default({}),
};

const searchKnowledgeSchema = {
  query: z.string().min(1),
  source: z.string().optional(),
  repo: z.string().optional(),
  domain: z.string().optional(),
  limit: z.number().int().min(1).max(10).default(5),
};

const resolveContextSchema = {
  task: z.string().min(1),
  source: z.string().optional(),
  repo: z.string().optional(),
  domain: z.string().optional(),
  files: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(10).default(5),
};

const resolveSourceActionSchema = {
  action: z.enum(["read", "write"]),
  artifactType: z.enum(["knowledge", "prd", "plan", "doc", "decision", "note"]).default("knowledge"),
  source: z.string().optional(),
  query: z.string().optional(),
  task: z.string().optional(),
  title: z.string().optional(),
  repo: z.string().optional(),
  domain: z.string().optional(),
};

const getKnowledgeSchema = {
  ids: z.array(z.string()).min(1).max(20),
  source: z.string().optional(),
};

const captureSessionLearningsSchema = {
  learnings: z
    .array(
      z.object({
        title: z.string().min(1),
        type: knowledgeTypeSchema,
        content: z.string().min(1),
        scope: knowledgeScopeSchema.default("global"),
        repo: z.string().optional(),
        domain: z.string().optional(),
        tags: z.array(z.string()).default([]),
        confidence: z.number().min(0).max(1).default(1),
      }),
    )
    .min(1)
    .max(20),
  source: z.string().optional(),
};

const asTextContent = (value: unknown, warning?: string) => ({
  content: [
    {
      type: "text" as const,
      text: warning
        ? `${warning}\n\n${JSON.stringify(value, null, 2)}`
        : JSON.stringify(value, null, 2),
    },
  ],
});

const summarizeInput = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(input)) {
    if (key === "content" && typeof rawValue === "string") {
      summary.contentLength = rawValue.length;
      continue;
    }

    if (key === "files" && Array.isArray(rawValue)) {
      summary.fileCount = rawValue.length;
      continue;
    }

    if (typeof rawValue === "string") {
      summary[key] = rawValue.length > 120 ? `${rawValue.slice(0, 117)}...` : rawValue;
      continue;
    }

    if (Array.isArray(rawValue)) {
      summary[key] = `array(${rawValue.length})`;
      continue;
    }

    summary[key] = rawValue;
  }

  return summary;
};

const summarizeOutput = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) {
    return {
      resultCount: value.length,
      topTitles: value
        .slice(0, 3)
        .map((item) =>
          item && typeof item === "object" && "title" in item ? String((item as { title: unknown }).title) : null,
        )
        .filter(Boolean),
    };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : undefined,
      title: typeof record.title === "string" ? record.title : undefined,
      resultCount: Array.isArray(record.results) ? record.results.length : undefined,
    };
  }

  return {};
};

const withToolLogging = <TInput extends Record<string, unknown> | undefined>(
  toolName: string,
  handler: (input: TInput) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
) => {
  return async (input: TInput) => {
    const startedAt = Date.now();
    logger.info(`MCP tool start: ${toolName}`, summarizeInput(input));

    try {
      const result = await handler(input);
      const parsed = JSON.parse(result.content[0]?.text ?? "null") as unknown;
      logger.info(`MCP tool success: ${toolName}`, {
        durationMs: Date.now() - startedAt,
        ...summarizeOutput(parsed),
      });
      return result;
    } catch (error: unknown) {
      logger.error(`MCP tool failure: ${toolName}`, {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  };
};

export const registerTools = (server: McpServer, memoryService: MemoryService, instructionsInstalled = true): void => {
  const warning = instructionsInstalled ? undefined : INSTRUCTIONS_WARNING;
  server.tool(
    "list_sources",
    "List Knowit sources, including local and external MCP-backed sources.",
    withToolLogging("list_sources", async () => asTextContent(memoryService.listSources(), warning)),
  );

  server.tool(
    "register_mcp_source",
    "Register an external MCP server as a Knowit source using explicit tool mappings.",
    registerMcpSourceSchema,
    withToolLogging("register_mcp_source", async (input) =>
      asTextContent(memoryService.registerMcpSource(input)),
    ),
  );

  server.tool(
    "connect_source",
    "Connect a first-class source provider such as local or notion. This is the preferred product-facing source onboarding flow.",
    connectSourceSchema,
    withToolLogging("connect_source", async (input) =>
      asTextContent(memoryService.connectKnownSource(input)),
    ),
  );

  server.tool(
    "store_knowledge",
    "Store knowledge in the selected Knowit source. This can target the local store or an external MCP-backed source.",
    storeKnowledgeSchema,
    withToolLogging("store_knowledge", async (input) => {
      const parsed = storeKnowledgeInputSchema.parse(input);
      const entry = await memoryService.storeKnowledge(parsed);
      return asTextContent(entry);
    }),
  );

  server.tool(
    "search_knowledge",
    "Search knowledge across one or more Knowit sources. Returns title, summary, and metadata — not full content. Call get_knowledge with the returned IDs to fetch full content for relevant entries.",
    searchKnowledgeSchema,
    withToolLogging("search_knowledge", async (input) => {
      const results = await memoryService.searchKnowledge(input);
      return asTextContent(results);
    }),
  );

  server.tool(
    "get_knowledge",
    "Fetch full content for one or more knowledge entries by ID. Use after search_knowledge or resolve_context to retrieve the complete content of relevant entries (Phase 2 of tiered retrieval).",
    getKnowledgeSchema,
    withToolLogging("get_knowledge", async (input) => {
      const entries = await memoryService.getKnowledge(input);
      return asTextContent(entries, warning);
    }),
  );

  server.tool(
    "resolve_context",
    "Resolve implementation context across one or more Knowit sources. Returns title, summary, and metadata — not full content. Call get_knowledge with the returned IDs to fetch full content for relevant entries.",
    resolveContextSchema,
    withToolLogging("resolve_context", async (input) => {
      const parsedInput = resolveContextInputSchema.parse(input);
      const results = await memoryService.resolveContext(parsedInput);
      return asTextContent({
        task: parsedInput.task,
        source: parsedInput.source ?? null,
        repo: parsedInput.repo ?? null,
        domain: parsedInput.domain ?? null,
        files: parsedInput.files,
        results,
      });
    }),
  );

  server.tool(
    "resolve_source_action",
    "Determine whether Knowit should handle a read/write directly or route the agent to an external provider MCP next. Use this when the user mentions Knowit but not the downstream provider.",
    resolveSourceActionSchema,
    withToolLogging("resolve_source_action", async (input) => {
      const parsedInput = resolveSourceActionInputSchema.parse(input);
      const result = await memoryService.resolveSourceAction(parsedInput);
      return asTextContent(result);
    }),
  );

  server.tool(
    "capture_session_learnings",
    "Batch store multiple knowledge items from this coding session. Existing entries with the same title, type, scope, repo, and domain are updated rather than duplicated. Call this at the end of a session to persist decisions, patterns, and conventions discovered during the session.",
    captureSessionLearningsSchema,
    withToolLogging("capture_session_learnings", async (input) => {
      const settled = await Promise.allSettled(
        input.learnings.map((learning) =>
          memoryService.storeKnowledge({
            ...learning,
            source: input.source,
            metadata: {},
          }),
        ),
      );

      const stored = settled
        .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
        .map((entry) => ({ id: entry.id, title: entry.title }));
      const failed = settled.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              {
                index,
                title: input.learnings[index]?.title ?? "unknown",
                reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
              },
            ]
          : [],
      );

      return asTextContent({
        stored: stored.length,
        failed: failed.length,
        entries: stored,
        failures: failed,
      });
    }),
  );
};
