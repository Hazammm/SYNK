export type ChatMessage = {
  id: string; channelId: string; body: string; parentId: string | null;
  clientMessageId: string; createdAt: string;
  sender: { id: string; name: string | null }; replyCount: number;
};
export type MessageEvent = { message: ChatMessage; parentReplyCount?: number };
export type MessagePage = { messages: ChatMessage[]; nextCursor: string | null };
export type ChannelSummary = { id: string; workspaceId: string; name: string; description: string; isPrivate: boolean; joined: boolean; memberCount: number; canManageMembers: boolean };
export type WorkspaceSummary = { id: string; name: string; role: "ADMIN" | "MEMBER" };
export type Ack = { ok: true } | { ok: false; error: string };
export type ClientEvents = { "channel:join": (data: { channelId: string }, ack: (result: Ack) => void) => void; "channel:leave": (data: { channelId: string }) => void };
export type ServerEvents = { "message:created": (event: MessageEvent) => void; "access:revoked": () => void };
