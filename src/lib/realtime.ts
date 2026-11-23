import type {
  ChannelSummary,
  ChatMessage,
  ChatPoll,
  ChatReaction,
  MessageEvent,
} from "./chat-types";
import type { PersonStatus } from "./account-types";

export type Realtime = {
  publish: (event: MessageEvent) => Promise<void>;
  publishMessageUpdated?: (event: { message: ChatMessage }) => Promise<void>;
  publishMessageDeleted?: (event: { messageId: string; channelId: string }) => Promise<void>;
  publishReactionUpdated?: (event: { messageId: string; channelId: string; reactions: ChatReaction[] }) => Promise<void>;
  publishPollUpdated?: (channelId: string, messageId: string, poll: ChatPoll) => Promise<void>;
  publishChannelUpdated?: (workspaceId: string, channel: ChannelSummary) => Promise<void>;
  publishUnreadUpdate?: (userId: string, event: { channelId: string; unreadCount: number; mentionCount: number }) => Promise<void>;
  publishPresence?: (workspaceId: string, userId: string, online: boolean) => Promise<void>;
  publishStatus?: (workspaceIds: string[], userId: string, status: PersonStatus) => Promise<void>;
  // A new alert for this person: refresh the count, and show a pop-up when `announcement` is set.
  notifyUser?: (userId: string, announcement: { title: string; body: string; url: string } | null) => Promise<void>;
  // Who has Synk open right now.
  onlineUserIds?: () => Set<string>;
  disconnectSession: (sessionId: string) => void;
  revokeUser: (userId: string) => void;
};

const state = globalThis as unknown as { synkRealtime?: Realtime };
export function realtime() {
  return state.synkRealtime;
}
export function setRealtime(value: Realtime | undefined) {
  state.synkRealtime = value;
}
