import { KnowledgeRepository } from "../db/knowledgeRepo.js";
import { JsonlKnowledgeRepository } from "../storage/jsonlKnowledgeRepo.js";
import type { KnowledgeSource } from "../types/source.js";
import type { MemorySourceProvider } from "./base.js";
import { CloudMemorySource } from "./cloudSource.js";
import { JsonlMemorySource } from "./jsonlSource.js";
import { McpMemorySource } from "./mcpSource.js";
import { SqliteMemorySource } from "./sqliteSource.js";

export class SourceRegistry {
  private readonly sqliteRepository?: KnowledgeRepository;
  private readonly jsonlRepository?: JsonlKnowledgeRepository;

  constructor(options: {
    sqliteRepository?: KnowledgeRepository;
    jsonlRepository?: JsonlKnowledgeRepository;
  } = {}) {
    this.sqliteRepository = options.sqliteRepository;
    this.jsonlRepository = options.jsonlRepository;
  }

  createProvider(source: KnowledgeSource): MemorySourceProvider {
    switch (source.kind) {
      case "jsonl":
        return new JsonlMemorySource(source, this.jsonlRepository ?? new JsonlKnowledgeRepository());
      case "sqlite":
        return new SqliteMemorySource(source, this.sqliteRepository ?? new KnowledgeRepository());
      case "mcp":
        return new McpMemorySource(source);
      case "cloud":
        return new CloudMemorySource(source);
      case "route":
        throw new Error(
          `Source ${source.id} is a routed provider. Use its provider MCP directly based on the stored guidance.`,
        );
      default: {
        const unreachable: never = source.kind;
        throw new Error(`Unsupported source kind: ${String(unreachable)}`);
      }
    }
  }
}
