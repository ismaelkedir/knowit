import { z } from "zod";

export const sourceKindSchema = z.enum(["sqlite", "mcp"]);

export const sourceToolMapSchema = z.object({
  store: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  resolve: z.string().trim().min(1).optional(),
});

export const sqliteSourceConfigSchema = z.object({
  mode: z.literal("sqlite"),
});

export const mcpSourceConfigSchema = z.object({
  mode: z.literal("mcp"),
  transport: z.literal("stdio").default("stdio"),
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().trim().min(1).optional(),
  env: z.record(z.string()).default({}),
  toolMap: sourceToolMapSchema,
});

export const sourceConfigSchema = z.discriminatedUnion("mode", [
  sqliteSourceConfigSchema,
  mcpSourceConfigSchema,
]);

export const knowledgeSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: sourceKindSchema,
  isDefault: z.boolean(),
  config: sourceConfigSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createMcpSourceInputSchema = z.object({
  name: z.string().trim().min(1),
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().trim().min(1).optional(),
  env: z.record(z.string()).default({}),
  toolMap: sourceToolMapSchema,
  isDefault: z.boolean().default(false),
});

export type SourceKind = z.infer<typeof sourceKindSchema>;
export type SourceToolMap = z.infer<typeof sourceToolMapSchema>;
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type CreateMcpSourceInput = z.infer<typeof createMcpSourceInputSchema>;
