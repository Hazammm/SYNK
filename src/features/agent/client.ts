import { z } from "zod";
import { AppError } from "../../lib/errors";
import type { AgentReply, AgentRequest } from "../../lib/agent-types";

const AGENT_TIMEOUT_MS = 90_000;
const target = z.object({ type: z.literal("ticket"), id: z.string(), key: z.string(), title: z.string(), projectId: z.string(), boardId: z.string() });
const replySchema = z.object({
  reply: z.string().max(20_000),
  actions: z.array(z.object({ tool: z.string().max(60), ok: z.boolean(), summary: z.string().max(2000), target: target.optional() })).max(30),
  pending: z.object({
    tool: z.string().max(60), summary: z.string().max(2000), target: target.optional(),
    changes: z.array(z.object({ field: z.string().max(60), from: z.string().max(300), to: z.string().max(300) })).max(30),
  }).nullable(),
});

export type AgentClient = (request: AgentRequest) => Promise<AgentReply>;

// Sends one turn to the Python agent service. The shared secret proves the request comes from this server.
export const callAgent: AgentClient = async request => {
  const url = process.env.AI_SERVICE_URL, secret = process.env.AI_SERVICE_SECRET;
  if (!url || !secret) throw new AppError(503, "The AI assistant is not set up on this server.");
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, "")}/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(request), signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new AppError(timedOut ? 504 : 503, timedOut ? "The AI assistant took too long to answer. Please try again." : "The AI assistant is not running. Start the agent service and try again.");
  }
  if (!response.ok) {
    console.error("[synk] Agent service responded", response.status);
    throw new AppError(502, "The AI assistant ran into a problem. Please try again.");
  }
  const parsed = replySchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new AppError(502, "The AI assistant sent an answer Synk could not read. Please try again.");
  return parsed.data;
};
