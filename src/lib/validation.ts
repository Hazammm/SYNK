import { z } from "zod";

export const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Invalid identifier.");
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const credentialsSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: z.string().min(10, "Use at least 10 characters.").max(72)
    .refine(value => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 UTF-8 bytes."),
}).strict();
export const workspaceSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export const channelSchema = z.object({
  name: z.string().trim().toLowerCase().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens."),
  description: z.string().trim().max(240).default(""),
  isPrivate: z.boolean().default(false),
}).strict();
export const messageSchema = z.object({
  body: z.string().trim().min(1, "Write a message first.").max(4000, "Messages can contain up to 4,000 characters."),
  parentId: idSchema.nullable().optional().transform(value => value ?? null),
  clientMessageId: z.string().uuid(),
}).strict();
export const historySchema = z.object({
  cursor: idSchema.optional(),
  parentId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
