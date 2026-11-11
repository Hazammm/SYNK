import { z } from "zod";

export const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Invalid identifier.");
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
// bcrypt only uses the first 72 bytes, so the limit is on UTF-8 bytes, not characters.
const passwordField = z.string().min(10, "Use at least 10 characters.").max(72)
  .refine(value => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 UTF-8 bytes.");
export const credentialsSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });
export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(72)
  .refine(value => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 UTF-8 bytes.");
const inviteEmailListSchema = z.array(emailSchema).max(50).transform(emails => [...new Set(emails)]);
export const createWorkspaceSchema = z.object({
  adminName: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
  workspaceName: z.string().trim().min(1).max(80),
  projectName: z.string().trim().min(1).max(80).default("My first project"),
  inviteEmails: inviteEmailListSchema.default([]),
}).strict().superRefine((data, ctx) => {
  if (data.inviteEmails.includes(data.email)) {
    ctx.addIssue({ code: "custom", path: ["inviteEmails"], message: "Use a different email address for each teammate." });
  }
});

/**
 * Schema for workspace creation when the user authenticated via Google.
 * No password — the account is Google-only.
 */
export const createWorkspaceGoogleSchema = z.object({
  workspaceName: z.string().trim().min(1).max(80),
  projectName: z.string().trim().min(1).max(80).default("My first project"),
  inviteEmails: inviteEmailListSchema.default([]),
}).strict();
export const inviteEmailsSchema = z.object({
  emails: inviteEmailListSchema.refine(emails => emails.length > 0, "Add at least one teammate email."),
}).strict();
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordField,
}).strict();
export const acceptInviteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  password: passwordSchema,
}).strict();
export const inviteTokenSchema = z.string().regex(/^[a-f0-9]{64}$/i, "Invalid invite.");
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

// Password reset schemas
export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required.").max(200),
  password: passwordField,
}).strict();
