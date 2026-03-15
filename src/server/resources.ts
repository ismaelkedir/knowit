import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryService } from "../services/memoryService.js";
import { logger } from "../utils/logger.js";

const withResourceLogging = <T>(
  resourceName: string,
  handler: () => Promise<T>,
): (() => Promise<T>) => {
  return async () => {
    const startedAt = Date.now();
    logger.info(`MCP resource read: ${resourceName}`);
    try {
      const result = await handler();
      logger.info(`MCP resource success: ${resourceName}`, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error: unknown) {
      logger.error(`MCP resource failure: ${resourceName}`, {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  };
};

export const registerResources = (server: McpServer, memoryService: MemoryService): void => {
  server.resource(
    "knowit-sources",
    "knowit://sources",
    withResourceLogging("knowit-sources", async () => ({
      contents: [
        {
          uri: "knowit://sources",
          mimeType: "application/json",
          text: JSON.stringify(memoryService.listSources(), null, 2),
        },
      ],
    })),
  );

  server.resource(
    "knowit-local-entries",
    "knowit://entries/local",
    withResourceLogging("knowit-local-entries", async () => ({
      contents: [
        {
          uri: "knowit://entries/local",
          mimeType: "application/json",
          text: JSON.stringify(await memoryService.listKnowledge({ source: "local", limit: 50 }), null, 2),
        },
      ],
    })),
  );

  server.resource(
    "knowit-local-entry",
    new ResourceTemplate("knowit://entries/local/{id}", { list: undefined }),
    async (uri, params) => {
      const startedAt = Date.now();
      const entryId = String(params.id);
      logger.info("MCP resource read: knowit-local-entry", { id: entryId });

      try {
        const entry = await memoryService.getKnowledgeEntry({
          source: "local",
          id: entryId,
        });

        logger.info("MCP resource success: knowit-local-entry", {
          durationMs: Date.now() - startedAt,
          id: entryId,
          found: Boolean(entry),
        });

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(entry, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        logger.error("MCP resource failure: knowit-local-entry", {
          durationMs: Date.now() - startedAt,
          id: entryId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    },
  );
};
