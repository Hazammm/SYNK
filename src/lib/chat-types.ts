import type { PersonStatus } from "./account-types";

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

export type ChatUnfurl = {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  siteName: string;
};

export type ChatPollOption = {
  id: string;
  label: string;
  position: number;
  count: number;
  userIds: string[];
};

export type ChatPoll = {
  id: string;
  question: string;
  multiSelect: boolean;
  closed: boolean;
  options: ChatPollOption[];
};

export type HuddlePeer = { userId: string; name: string; muted: boolean };
export type HuddleState = { channelId: string; participants: HuddlePeer[] };
export type HuddleSignal = { channelId: string; fromUserId: string; toUserId: string; payload: unknown };

export type ChatMessage = {
  id: string;
  workspaceId?: string;
  channelId: string;
  authorId?: string;
  body: string;
  threadRootId?: string | null;
  // A thread reply that was also sent to the channel, so it shows in the main feed too.
  alsoInChannel?: boolean;
  // Whether the person reading has saved it for later.
  saved?: boolean;
  viaApp?: string;
  unfurls?: ChatUnfurl[];
  poll?: ChatPoll | null;
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
  // This person has muted it: no alerts except direct mentions.
  muted?: boolean;
  // Archived channels are read-only.
  archived?: boolean;
  // ADMINS makes it announcement-only: only admins and the creator start new posts.
  postingPolicy?: "EVERYONE" | "ADMINS";
  canPost?: boolean;
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
  "huddle:join": (data: { channelId: string }, ack?: SocketCallback<SocketAck<HuddleState>>) => void;
  "huddle:leave": (data: { channelId: string }, ack?: SocketCallback<SocketAck<HuddleState>>) => void;
  "huddle:mute": (data: { channelId: string; muted: boolean }, ack?: SocketCallback<SocketAck<HuddleState>>) => void;
  "huddle:signal": (data: { channelId: string; toUserId: string; payload: unknown }) => void;
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
  "status:update": (event: { userId: string; status: PersonStatus }) => void;
  "notification:new": (event: { announcement: { title: string; body: string; url: string } | null }) => void;
  "channel:updated": (event: { channel: ChannelSummary }) => void;
  "unread:update": (event: { channelId: string; unreadCount: number; mentionCount: number }) => void;
  "access:revoked": () => void;
  "huddle:state": (event: HuddleState) => void;
  "huddle:signal": (event: HuddleSignal) => void;
  "poll:updated": (event: { channelId: string; messageId: string; poll: ChatPoll }) => void;
};

export const TYPING_TTL_MS = 4000;

// Attachment types shown in the browser; every other file is offered as a download.
export const INLINE_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

type Person = { id: string; name: string | null; image: string | null };
// A message saved for later, with where it was posted.
export type SavedItem = { messageId: string; channelId: string; threadRootId: string | null; place: string; author: Person; snippet: string; sentAt: string; savedAt: string };
// A thread in the Threads inbox.
export type ThreadSummary = { rootId: string; channelId: string; place: string; author: Person; snippet: string; replyCount: number; lastReply: { author: Person; snippet: string; at: string } };
