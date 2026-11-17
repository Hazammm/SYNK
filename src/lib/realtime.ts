import type {
  ChannelSummary,
  ChatMessage,
  ChatReaction,
  MessageEvent,
} from "./chat-types";

export type Realtime = {
  publish: (event: MessageEvent) => Promise<void>;
  publishMessageUpdated?: (event: { message: ChatMessage }) => Promise<void>;
  publishMessageDeleted?: (event: { messageId: string; channelId: string }) => Promise<void>;
  publishReactionUpdated?: (event: { messageId: string; channelId: string; reactions: ChatReaction[] }) => Promise<void>;
  publishChannelUpdated?: (workspaceId: string, channel: ChannelSummary) => Promise<void>;
  publishUnreadUpdate?: (userId: string, event: { channelId: string; unreadCount: number; mentionCount: number }) => Promise<void>;
  publishPresence?: (workspaceId: string, userId: string, online: boolean) => Promise<void>;
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
