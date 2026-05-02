import { z } from "zod";

export const sourceKindSchema = z.enum(["jsonl", "sqlite", "mcp", "route", "cloud"]);
export const knownSourceProviderSchema = z.enum(["local", "notion"]);

export const sourceToolMapSchema = z.object({
  store: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  resolve: z.string().trim().min(1).optional(),
});

export const sqliteSourceConfigSchema = z.object({
  mode: z.literal("sqlite"),
});

export const jsonlSourceConfigSchema = z.object({
  mode: z.literal("jsonl"),
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

export const routeSourceConfigSchema = z.object({
  mode: z.literal("route"),
  provider: knownSourceProviderSchema.exclude(["local"]),
  mcpServerName: z.string().trim().min(1),
  setupHint: z.string().min(1),
  readHint: z.string().min(1),
  writeHint: z.string().min(1),
});

export const cloudSourceConfigSchema = z.object({
  mode: z.literal("cloud"),
  apiUrl: z.string().url(),
  token: z.string().min(1),
});

export const sourceConfigSchema = z.discriminatedUnion("mode", [
  jsonlSourceConfigSchema,
  sqliteSourceConfigSchema,
  mcpSourceConfigSchema,
  routeSourceConfigSchema,
  cloudSourceConfigSchema,
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

export const connectKnownSourceInputSchema = z.object({
  provider: knownSourceProviderSchema,
  mcpServerName: z.string().trim().min(1).optional(),
  isDefault: z.boolean().default(false),
});

export type CloudSourceConfig = z.infer<typeof cloudSourceConfigSchema>;
export type SourceKind = z.infer<typeof sourceKindSchema>;
export type KnownSourceProvider = z.infer<typeof knownSourceProviderSchema>;
export type SourceToolMap = z.infer<typeof sourceToolMapSchema>;
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type CreateMcpSourceInput = z.infer<typeof createMcpSourceInputSchema>;
export type ConnectKnownSourceInput = z.infer<typeof connectKnownSourceInputSchema>;
