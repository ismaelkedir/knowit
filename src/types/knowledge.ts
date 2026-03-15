import { z } from "zod";
import { sourceKindSchema } from "./source.js";

export const knowledgeTypeSchema = z.enum([
  "rule",
  "architecture",
  "pattern",
  "decision",
  "convention",
  "note",
]);

export const knowledgeScopeSchema = z.enum([
  "global",
  "team",
  "repo",
  "domain",
]);

export const knowledgeEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: knowledgeTypeSchema,
  content: z.string().min(1),
  scope: knowledgeScopeSchema,
  repo: z.string().nullable(),
  domain: z.string().nullable(),
  tags: z.array(z.string()),
  embedding: z.array(z.number()).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  confidence: z.number().min(0).max(1),
  url: z.string().url().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const knowledgeEntryInputSchema = z.object({
  title: z.string().min(1),
  type: knowledgeTypeSchema,
  content: z.string().min(1),
  scope: knowledgeScopeSchema.default("global"),
  repo: z.string().trim().min(1).nullable().optional(),
  domain: z.string().trim().min(1).nullable().optional(),
  tags: z.array(z.string()).default([]),
  embedding: z.array(z.number()).nullable().optional(),
  confidence: z.number().min(0).max(1).default(1),
  url: z.string().url().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const knowledgeListFiltersSchema = z.object({
  type: knowledgeTypeSchema.optional(),
  repo: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(100).default(50),
});

export const knowledgeSearchFiltersSchema = z.object({
  query: z.string().min(1),
  source: z.string().trim().min(1).optional(),
  repo: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(50).default(5),
});

export const resolveContextInputSchema = z.object({
  task: z.string().min(1),
  source: z.string().trim().min(1).optional(),
  repo: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1).optional(),
  files: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(10).default(5),
});

export const storeKnowledgeInputSchema = z.object({
  source: z.string().trim().min(1).optional(),
  title: z.string().min(1),
  type: knowledgeTypeSchema,
  content: z.string().min(1),
  scope: knowledgeScopeSchema.default("global"),
  repo: z.string().trim().min(1).nullable().optional(),
  domain: z.string().trim().min(1).nullable().optional(),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1),
  url: z.string().url().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const knowledgeResultSchema = knowledgeEntrySchema.extend({
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  sourceKind: sourceKindSchema,
  score: z.number().min(0).max(1),
});

export type KnowledgeType = z.infer<typeof knowledgeTypeSchema>;
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type KnowledgeEntryInput = z.infer<typeof knowledgeEntryInputSchema>;
export type KnowledgeListFilters = z.infer<typeof knowledgeListFiltersSchema>;
export type KnowledgeSearchFilters = z.infer<typeof knowledgeSearchFiltersSchema>;
export type ResolveContextInput = z.infer<typeof resolveContextInputSchema>;
export type StoreKnowledgeInput = z.infer<typeof storeKnowledgeInputSchema>;
export type KnowledgeResult = z.infer<typeof knowledgeResultSchema>;
