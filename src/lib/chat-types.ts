export type ChannelType = "PUBLIC" | "PRIVATE" | "DM" | "GROUP_DM";

export type ChatReaction = {
  emoji: string;
  count: number;
  userIds: string[];
};

export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  url?: string;
};

export type ChatMessage = {
  id: string;
  workspaceId?: string;
  channelId: string;
  authorId?: string;
  body: string;
  threadRootId?: string | null;
  clientId?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  author?: { id: string; name: string | null; image?: string | null };
  sender: { id: string; name: string | null; image?: string | null };
  replyCount: number;
  reactions?: ChatReaction[];
  attachments?: ChatAttachment[];
  isPinned?: boolean;
  status?: "sending" | "failed" | "sent";

  // Compatibility aliases
  senderId?: string;
  parentId?: string | null;
  clientMessageId?: string;
};

export type MessageEvent = { message: ChatMessage; parentReplyCount?: number };
export type MessagePage = { messages: ChatMessage[]; nextCursor: string | null };

export type ChannelSummary = {
  id: string;
  workspaceId: string;
  name: string | null;
  type: ChannelType;
  topic: string;
  description: string;
  isDefault: boolean;
  isPrivate: boolean;
  joined: boolean;
  memberCount: number;
  canManageMembers: boolean;
  unreadCount?: number;
  mentionCount?: number;
  otherUser?: { id: string; name: string | null; image?: string | null; online?: boolean };
};

export type WorkspaceSummary = { id: string; name: string; role: "ADMIN" | "MEMBER" };

export type SocketAck<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
export type Ack = { ok: true } | { ok: false; error: string };

export type SocketCallback<T = unknown> = (errorOrResult: unknown, maybeResult?: T) => void;

export type ClientEvents = {
  "channel:join": (data: { channelId: string }, ack?: SocketCallback<SocketAck<{ channelId: string }>>) => void;
  "channel:leave": (data: { channelId: string }, ack?: SocketCallback<SocketAck<{ channelId: string }>>) => void;
  "channel:read": (data: { channelId: string }, ack?: SocketCallback<SocketAck<{ channelId: string; lastReadAt: string }>>) => void;
  "message:send": (data: { channelId: string; body: string; clientId: string; threadRootId?: string | null; attachmentIds?: string[] }, ack?: SocketCallback<SocketAck<ChatMessage>>) => void;
  "message:edit": (data: { messageId: string; body: string }, ack?: SocketCallback<SocketAck<ChatMessage>>) => void;
  "message:delete": (data: { messageId: string }, ack?: SocketCallback<SocketAck<{ messageId: string }>>) => void;
  "reaction:toggle": (data: { messageId: string; emoji: string }, ack?: SocketCallback<SocketAck<{ messageId: string; emoji: string; reactions: ChatReaction[] }>>) => void;
  "typing": (data: { channelId: string }) => void;
  "heartbeat": () => void;
};

export type TypingEvent = { channelId: string; userId: string; name: string };

export type ServerEvents = {
  "message:new": (event: MessageEvent) => void;
  "message:created": (event: MessageEvent) => void; // backwards compat
  "message:updated": (event: { message: ChatMessage }) => void;
  "message:deleted": (event: { messageId: string; channelId: string }) => void;
  "reaction:updated": (event: { messageId: string; channelId: string; reactions: ChatReaction[] }) => void;
  "typing": (event: TypingEvent) => void;
  "presence:update": (event: { userId: string; workspaceId: string; online: boolean }) => void;
  "channel:updated": (event: { channel: ChannelSummary }) => void;
  "unread:update": (event: { channelId: string; unreadCount: number; mentionCount: number }) => void;
  "access:revoked": () => void;
};

export const TYPING_TTL_MS = 4000;
