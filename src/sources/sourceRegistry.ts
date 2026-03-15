import { KnowledgeRepository } from "../db/knowledgeRepo.js";
import type { KnowledgeSource } from "../types/source.js";
import type { MemorySourceProvider } from "./base.js";
import { McpMemorySource } from "./mcpSource.js";
import { SqliteMemorySource } from "./sqliteSource.js";

export class SourceRegistry {
  private readonly localRepository: KnowledgeRepository;

  constructor(localRepository: KnowledgeRepository = new KnowledgeRepository()) {
    this.localRepository = localRepository;
  }

  createProvider(source: KnowledgeSource): MemorySourceProvider {
    switch (source.kind) {
      case "sqlite":
        return new SqliteMemorySource(source, this.localRepository);
      case "mcp":
        return new McpMemorySource(source);
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
