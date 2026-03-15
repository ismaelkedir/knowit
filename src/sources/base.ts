import type {
  KnowledgeEntry,
  KnowledgeListFilters,
  KnowledgeResult,
  ResolveContextInput,
  StoreKnowledgeInput,
} from "../types/knowledge.js";
import type { KnowledgeSource } from "../types/source.js";

export interface MemorySourceProvider {
  readonly definition: KnowledgeSource;
  storeKnowledge(input: StoreKnowledgeInput): Promise<KnowledgeEntry>;
  searchKnowledge(input: {
    query: string;
    repo?: string;
    domain?: string;
    limit: number;
  }): Promise<KnowledgeResult[]>;
  resolveContext(input: ResolveContextInput): Promise<KnowledgeResult[]>;
  listKnowledge?(filters: KnowledgeListFilters): Promise<KnowledgeEntry[]>;
}
