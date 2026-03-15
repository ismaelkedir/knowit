import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
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
    version: "0.2.0",
  });

  registerTools(server, memoryService);
  registerResources(server, memoryService);

  return server;
};

const start = async (): Promise<void> => {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Knowit MCP server started over stdio.");
};

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : "Unknown MCP server error";
  logger.error(message);
  process.exit(1);
});
