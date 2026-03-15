import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import { MemoryService } from "../services/memoryService.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";
import { logger } from "../utils/logger.js";

dotenv.config();

export const createMcpServer = (): McpServer => {
  const memoryService = new MemoryService();
  memoryService.init();

  const server = new McpServer({
    name: "knowit",
    version: "0.2.1",
  });

  registerTools(server, memoryService);
  registerResources(server, memoryService);

  return server;
};

export const startMcpServer = async (): Promise<void> => {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Knowit MCP server started over stdio.");
};

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectExecution) {
  startMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : "Unknown MCP server error";
    logger.error(message);
    process.exit(1);
  });
}
