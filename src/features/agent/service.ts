import type { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { mintAgentToken } from "../../lib/agent-token";
import { requireWorkspace } from "../../lib/permissions";
import { agentChatSchema, idSchema } from "../../lib/validation";
import { buildAgentContext } from "./context";
import { callAgent, type AgentClient } from "./client";
import type { AgentAction, AgentMessage, AgentPending, ChatTurn, ConversationDetail, ConversationSummary } from "../../lib/agent-types";

const MAX_LISTED_CONVERSATIONS = 30;
const MAX_LISTED_MESSAGES = 200;
const TITLE_LENGTH = 60;
type ConversationRecord = Prisma.ConversationGetPayload<object>;
type MessageRecord = Prisma.ConversationMessageGetPayload<object>;

const summarize = (row: ConversationRecord): ConversationSummary => ({ id: row.id, workspaceId: row.workspaceId, title: row.title, updatedAt: row.updatedAt.toISOString() });
function serialize(row: MessageRecord): AgentMessage {
  const pending = row.pending as AgentPending | null;
  return {
    id: row.id, role: row.role, body: row.body, createdAt: row.createdAt.toISOString(),
    actions: row.actions as AgentAction[], pending: pending && row.pendingStatus ? { ...pending, status: row.pendingStatus } : null,
  };
}

// Conversations are private to the person who started them, and stop being readable
// once that person leaves the workspace. Someone else's conversation looks missing.
async function requireConversation(userId: string, conversationId: string) {
  idSchema.parse(conversationId);
  const conversation = await db.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw new AppError(404, "Conversation not found.");
  await requireWorkspace(userId, conversation.workspaceId);
  return conversation;
}

export async function listConversations(userId: string, workspaceId: string): Promise<ConversationSummary[]> {
  await requireWorkspace(userId, workspaceId);
  const rows = await db.conversation.findMany({ where: { userId, workspaceId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: MAX_LISTED_CONVERSATIONS });
  return rows.map(summarize);
}

export async function getConversation(userId: string, conversationId: string): Promise<ConversationDetail> {
  const conversation = await requireConversation(userId, conversationId);
  // The newest messages, returned oldest first.
  const rows = await db.conversationMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MAX_LISTED_MESSAGES });
  return { ...summarize(conversation), messages: rows.reverse().map(serialize) };
}

// One turn at a time per conversation: a second request while the agent is still working is refused.
const globalBusy = globalThis as unknown as { synkAgentBusy?: Set<string> };
const busy = globalBusy.synkAgentBusy ??= new Set<string>();

// Handles both kinds of turn: a new message, or the answer to a pending confirmation.
// `agent` is injectable so tests can run without the Python service.
export async function sendAgentTurn(userId: string, input: unknown, agent: AgentClient = callAgent): Promise<ChatTurn> {
  const data = agentChatSchema.parse(input);
  const existing = data.conversationId ? await requireConversation(userId, data.conversationId) : null;
  if (!existing) await requireWorkspace(userId, data.workspaceId!);
  const lockKey = existing?.id ?? `new:${userId}`;
  if (busy.has(lockKey)) throw new AppError(409, "The assistant is still working on your last message.");
  busy.add(lockKey);
  try {
    return data.decision ? await decide(userId, existing!, data.decision, agent) : await say(userId, existing, data.workspaceId, data.message!, agent);
  } finally { busy.delete(lockKey); }
}

async function ask(userId: string, conversation: ConversationRecord, turn: { message: string } | { decision: "approve" | "reject" }, agent: AgentClient) {
  const reply = await agent({
    threadId: conversation.id, ...turn,
    userToken: mintAgentToken({ userId, workspaceId: conversation.workspaceId, conversationId: conversation.id }),
    context: await buildAgentContext(userId, conversation.workspaceId),
  });
  // Both writes together, so the conversation's place in the list always matches its last message.
  const [message, updated] = await db.$transaction([
    db.conversationMessage.create({
      data: {
        conversationId: conversation.id, role: "ASSISTANT", body: reply.reply, actions: reply.actions as Prisma.InputJsonArray,
        ...(reply.pending && { pending: reply.pending as Prisma.InputJsonObject, pendingStatus: "PENDING" as const }),
      },
    }),
    db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
  ]);
  return { message: serialize(message), conversation: summarize(updated) };
}

async function say(userId: string, existing: ConversationRecord | null, workspaceId: string | undefined, text: string, agent: AgentClient): Promise<ChatTurn> {
  if (existing && await db.conversationMessage.count({ where: { conversationId: existing.id, pendingStatus: "PENDING" } })) {
    throw new AppError(409, "Confirm or cancel the pending change before sending another message.");
  }
  const conversation = existing ?? await db.conversation.create({ data: { userId, workspaceId: workspaceId!, title: text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1)}…` : text } });
  const question = await db.conversationMessage.create({ data: { conversationId: conversation.id, role: "USER", body: text } });
  try {
    const answer = await ask(userId, conversation, { message: text }, agent);
    return { conversation: answer.conversation, messages: [serialize(question), answer.message], resolved: null };
  } catch (error) {
    // Nothing was answered, so take the question back out and let the person retry.
    if (existing) await db.conversationMessage.delete({ where: { id: question.id } });
    else await db.conversation.delete({ where: { id: conversation.id } });
    throw error;
  }
}

async function decide(userId: string, conversation: ConversationRecord, decision: "approve" | "reject", agent: AgentClient): Promise<ChatTurn> {
  const waiting = await db.conversationMessage.findFirst({ where: { conversationId: conversation.id, pendingStatus: "PENDING" }, orderBy: { createdAt: "desc" } });
  const status = decision === "approve" ? "APPROVED" as const : "REJECTED" as const;
  // Claiming the row first means a double click cannot approve the same change twice.
  const claimed = waiting && await db.conversationMessage.updateMany({ where: { id: waiting.id, pendingStatus: "PENDING" }, data: { pendingStatus: status } });
  if (!waiting || !claimed?.count) throw new AppError(409, "There is nothing waiting for your confirmation.");
  try {
    const answer = await ask(userId, conversation, { decision }, agent);
    return { conversation: answer.conversation, messages: [answer.message], resolved: { messageId: waiting.id, status } };
  } catch (error) {
    await db.conversationMessage.update({ where: { id: waiting.id }, data: { pendingStatus: "PENDING" } });
    throw error;
  }
}
