import type { ChatMessage, MessageEvent } from "../../lib/chat-types";

export { messageOf, request } from "../../lib/client-http";

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map(message => [message.id, message]));
  const optimisticByClient = new Map<string, string>();
  for (const m of current) {
    const key = m.clientId || m.clientMessageId;
    if (key && (m.status === "sending" || m.status === "failed" || m.id.startsWith("opt-"))) {
      optimisticByClient.set(key, m.id);
    }
  }

  for (const message of incoming) {
    const key = message.clientId || message.clientMessageId;
    if (key && optimisticByClient.has(key)) {
      const optId = optimisticByClient.get(key)!;
      if (optId !== message.id) {
        byId.delete(optId);
      }
    }
    if (key) {
      for (const [id, m] of byId.entries()) {
        if (id !== message.id && (m.clientId === key || m.clientMessageId === key) && (m.id.startsWith("opt-") || m.status === "sending" || m.status === "failed")) {
          byId.delete(id);
        }
      }
    }
    const previous = byId.get(message.id);
    byId.set(message.id, {
      ...message,
      replyCount: Math.max(previous?.replyCount ?? 0, message.replyCount),
      status: message.status ?? "sent",
    });
  }
  return [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      : a.createdAt < b.createdAt ? -1 : 1
  );
}

// "Asra is typing…", "Asra and Bilal are typing…", then "Several people are typing…".
export function typingText(names: string[]) {
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

export function applyMessageEvent(messages: ChatMessage[], event: MessageEvent, parentId: string | null) {
  const targetParent = event.message.threadRootId ?? event.message.parentId ?? null;
  if (targetParent === parentId) return mergeMessages(messages, [event.message]);
  if (parentId === null && targetParent && event.parentReplyCount !== undefined) {
    return messages.map(message =>
      message.id === targetParent
        ? { ...message, replyCount: Math.max(message.replyCount, event.parentReplyCount!) }
        : message
    );
  }
  return messages;
}