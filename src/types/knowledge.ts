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

export const knowledgeEntryInputSchema = z
  .object({
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
  })
  .superRefine((value, context) => {
    if ((value.scope === "repo" || value.scope === "domain") && !value.repo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repo"],
        message: "repo is required when scope is repo or domain.",
      });
    }

    if (value.scope === "domain" && !value.domain) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["domain"],
        message: "domain is required when scope is domain.",
      });
    }
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

export const storeKnowledgeInputSchema = z
  .object({
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
  })
  .superRefine((value, context) => {
    if ((value.scope === "repo" || value.scope === "domain") && !value.repo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repo"],
        message: "repo is required when scope is repo or domain.",
      });
    }

    if (value.scope === "domain" && !value.domain) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["domain"],
        message: "domain is required when scope is domain.",
      });
    }
  });

export const knowledgeResultSchema = knowledgeEntrySchema.extend({
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  sourceKind: sourceKindSchema,
  score: z.number().min(0).max(1),
});

export const resolveSourceActionInputSchema = z.object({
  action: z.enum(["read", "write"]),
  artifactType: z.enum(["knowledge", "prd", "plan", "doc", "decision", "note"]).default("knowledge"),
  source: z.string().trim().min(1).optional(),
  query: z.string().min(1).optional(),
  task: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  repo: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1).optional(),
});

export const sourceActionResultSchema = z.object({
  mode: z.enum(["local", "route"]),
  action: z.enum(["read", "write"]),
  artifactType: z.enum(["knowledge", "prd", "plan", "doc", "decision", "note"]),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  sourceKind: sourceKindSchema,
  shouldUseKnowitDirectly: z.boolean(),
  mcpServerName: z.string().nullable(),
  provider: z.string().nullable(),
  nextStep: z.string().min(1),
  readHint: z.string().nullable(),
  writeHint: z.string().nullable(),
  storeDistilledMemory: z.boolean(),
  relevantKnowledge: z.array(knowledgeResultSchema).default([]),
});

export type KnowledgeType = z.infer<typeof knowledgeTypeSchema>;
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type KnowledgeEntryInput = z.infer<typeof knowledgeEntryInputSchema>;
export type KnowledgeListFilters = z.infer<typeof knowledgeListFiltersSchema>;
export type KnowledgeSearchFilters = z.infer<typeof knowledgeSearchFiltersSchema>;
export type ResolveContextInput = z.infer<typeof resolveContextInputSchema>;
export type ResolveSourceActionInput = z.infer<typeof resolveSourceActionInputSchema>;
export type StoreKnowledgeInput = z.infer<typeof storeKnowledgeInputSchema>;
export type KnowledgeResult = z.infer<typeof knowledgeResultSchema>;
export type SourceActionResult = z.infer<typeof sourceActionResultSchema>;
