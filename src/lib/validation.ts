import { z } from "zod";

export const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Invalid identifier.");
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
// bcrypt only uses the first 72 bytes, so the limit is on UTF-8 bytes, not characters.
export const passwordField = z.string().min(10, "Use at least 10 characters.").max(72)
  .refine(value => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 UTF-8 bytes.");
export const credentialsSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordField,
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

// Password reset schemas
export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required.").max(200),
  password: passwordField,
}).strict();

// Issue tracking schemas
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD.")
  .transform(value => new Date(`${value}T00:00:00.000Z`))
  .refine(date => !Number.isNaN(date.getTime()), "Enter a valid date.");
const noneOrId = z.union([z.literal("none"), idSchema]);
export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const projectLevelSchema = z.enum(["READ", "WRITE"]);
export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name the project.").max(80),
  // Must match the ticket-key pattern chat links recognise (SYN in SYN-12).
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, "Use 2 to 10 letters or digits, starting with a letter."),
}).strict();
export const projectAccessSchema = z.object({ userId: idSchema, level: projectLevelSchema.nullable() }).strict();
const columnInput = { name: z.string().trim().min(1, "Name every column.").max(40), isDone: z.boolean().default(false) };
export const boardSchema = z.object({
  name: z.string().trim().min(1, "Name the board.").max(60),
  columns: z.array(z.object(columnInput).strict()).min(1, "Keep at least one column.").max(12).optional(),
}).strict();
export const boardUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name the board.").max(60).optional(),
  columns: z.array(z.object({ id: idSchema.optional(), ...columnInput }).strict()).min(1, "Keep at least one column.").max(12).optional(),
}).strict();
const sprintFields = {
  name: z.string().trim().min(1, "Name the sprint.").max(60),
  goal: z.string().trim().max(240),
  startDate: dateSchema,
  endDate: dateSchema,
};
export const sprintSchema = z.object({ ...sprintFields, goal: sprintFields.goal.default("") }).strict()
  .refine(sprint => sprint.endDate >= sprint.startDate, "The end date cannot be before the start date.");
export const sprintUpdateSchema = z.object({
  name: sprintFields.name.optional(), goal: sprintFields.goal.optional(),
  startDate: dateSchema.optional(), endDate: dateSchema.optional(),
  state: z.enum(["ACTIVE", "COMPLETED"]).optional(),
}).strict();
const ticketFields = {
  title: z.string().trim().min(1, "Give the ticket a title.").max(200),
  description: z.string().trim().max(8000),
  priority: prioritySchema,
  assigneeId: idSchema.nullable(),
  sprintId: idSchema.nullable(),
  dueDate: dateSchema.nullable(),
  columnId: idSchema,
};
export const ticketSchema = z.object({
  boardId: idSchema,
  title: ticketFields.title,
  description: ticketFields.description.default(""),
  priority: ticketFields.priority.default("MEDIUM"),
  assigneeId: ticketFields.assigneeId.optional(),
  sprintId: ticketFields.sprintId.optional(),
  dueDate: ticketFields.dueDate.optional(),
  columnId: ticketFields.columnId.optional(),
}).strict();
export const ticketUpdateSchema = z.object({
  title: ticketFields.title.optional(), description: ticketFields.description.optional(),
  priority: ticketFields.priority.optional(), assigneeId: ticketFields.assigneeId.optional(),
  sprintId: ticketFields.sprintId.optional(), dueDate: ticketFields.dueDate.optional(),
  columnId: ticketFields.columnId.optional(),
  // Index inside the target column; omitted means "at the end".
  position: z.number().int().min(0).max(10_000).optional(),
}).strict().refine(update => Object.keys(update).length > 0, "Nothing to update.");
export const ticketFilterSchema = z.object({
  boardId: idSchema.optional(), projectId: idSchema.optional(),
  assigneeId: noneOrId.optional(), sprintId: noneOrId.optional(),
  priority: prioritySchema.optional(), columnId: idSchema.optional(),
}).strict().refine(filter => Boolean(filter.boardId) !== Boolean(filter.projectId), "Filter by either a board or a project.");
export const commentSchema = z.object({
  body: z.string().trim().min(1, "Write a comment first.").max(4000, "Comments can contain up to 4,000 characters."),
  mentionIds: z.array(idSchema).max(20).default([]),
}).strict();
export const notificationReadSchema = z.object({ ids: z.array(idSchema).min(1).max(100).optional() }).strict();
export const reportQuerySchema = z.object({ sprintId: idSchema.optional() }).strict();

// AI agent schemas
// A turn is either a message (starting a conversation needs a workspace) or the answer to a pending confirmation.
export const agentChatSchema = z.object({
  workspaceId: idSchema.optional(), conversationId: idSchema.optional(),
  message: z.string().trim().min(1, "Write a message first.").max(4000, "Messages can contain up to 4,000 characters.").optional(),
  decision: z.enum(["approve", "reject"]).optional(),
}).strict()
  .refine(turn => Boolean(turn.message) !== Boolean(turn.decision), "Send either a message or a decision.")
  .refine(turn => turn.decision ? Boolean(turn.conversationId) : Boolean(turn.conversationId ?? turn.workspaceId), "Choose a workspace or a conversation.");

// Account settings schemas
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Names can contain up to 80 characters.").optional(),
  notifications: z.object({ assigned: z.boolean().optional(), comments: z.boolean().optional(), mentions: z.boolean().optional() }).strict().optional(),
}).strict().refine(update => update.name !== undefined || (update.notifications && Object.keys(update.notifications).length > 0), "Nothing to update.");
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(72),
  newPassword: passwordField,
}).strict();

// Docs schemas
const docTitle = z.string().trim().min(1, "Give the page a title.").max(150, "Titles can contain up to 150 characters.");
const docContent = z.string().max(100_000, "Pages can contain up to 100,000 characters.");
export const docCreateSchema = z.object({ title: docTitle, content: docContent.default(""), parentId: idSchema.nullable().optional() }).strict();
export const docUpdateSchema = z.object({
  title: docTitle.optional(), content: docContent.optional(), parentId: idSchema.nullable().optional(),
  version: z.number().int().min(1),
}).strict().refine(update => update.title !== undefined || update.content !== undefined || update.parentId !== undefined, "Nothing to update.");
export const docSearchSchema = z.object({ query: z.string().trim().min(2, "Search for at least 2 characters.").max(200) }).strict();
