// Shapes shared by the AI agent API, the tool endpoints the agent calls, and the chat panel.
export type AgentTarget =
  | { type: "ticket"; id: string; key: string; title: string; projectId: string; boardId: string }
  | { type: "doc"; id: string; title: string; projectId: string };
export type AgentChange = { field: string; from: string; to: string };
export type AgentFailureCode = "forbidden" | "not_found" | "ambiguous" | "invalid" | "rate_limited";

// What a tool endpoint returns to the agent. Failures are ordinary results, so the model can explain them.
export type AgentToolSuccess = { ok: true; summary: string; target?: AgentTarget; data?: unknown; preview?: { changes: AgentChange[] } };
export type AgentToolFailure = { ok: false; code: AgentFailureCode; message: string; candidates?: string[] };
export type AgentToolResult = AgentToolSuccess | AgentToolFailure;

// What the agent service returns for one turn.
export type AgentAction = { tool: string; ok: boolean; summary: string; target?: AgentTarget };
export type AgentPending = { tool: string; summary: string; target?: AgentTarget; changes: AgentChange[] };
export type AgentReply = { reply: string; actions: AgentAction[]; pending: AgentPending | null };

// Everything the agent is told about the person and workspace it is working for.
export type AgentProjectContext = { key: string; name: string; access: "edit" | "view"; boards: { name: string; statuses: string[] }[]; members: string[]; sprints: { name: string; state: "planned" | "active" }[]; pages: string[] };
export type AgentContext = { today: string; user: { name: string }; workspace: { name: string; role: "admin" | "member" }; projects: AgentProjectContext[] };
export type AgentRequest = { threadId: string; userToken: string; context: AgentContext; message?: string; decision?: "approve" | "reject" };

export type PendingStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AgentMessage = {
  id: string; role: "USER" | "ASSISTANT"; body: string; createdAt: string;
  actions: AgentAction[]; pending: (AgentPending & { status: PendingStatus }) | null;
};
export type ConversationSummary = { id: string; workspaceId: string; title: string; updatedAt: string };
export type ConversationDetail = ConversationSummary & { messages: AgentMessage[] };
// `resolved` reports the confirmation that this turn answered, so the panel can update that card.
export type ChatTurn = { conversation: ConversationSummary; messages: AgentMessage[]; resolved: { messageId: string; status: PendingStatus } | null };
// Window event fired after the agent changes tickets, so an open board or sprint list reloads.
export const TICKETS_CHANGED = "synk-tickets-changed";
