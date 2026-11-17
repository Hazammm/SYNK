"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import {
  TYPING_TTL_MS,
  type ChatMessage,
  type ClientEvents,
  type MessageEvent,
  type MessagePage,
  type ServerEvents,
} from "../../lib/chat-types";

import { HttpError, messageOf, request } from "../../lib/client-http";
export { messageOf, request };

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

function applyEvent(messages: ChatMessage[], event: MessageEvent, parentId: string | null) {
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

export function useMessages(channelId: string, parentId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [denied, setDenied] = useState(false);
  const generation = useRef(0);
  const refreshRef = useRef<() => void>(() => { });
  // Who is typing in this channel, by user id, with when their last signal expires.
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const socketRef = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const lastTypingSent = useRef(0);
  const base = `/api/channels/${channelId}/messages`;

  const markRead = useCallback(() => {
    if (socketRef.current?.connected && !parentId) {
      socketRef.current.emit("channel:read", { channelId });
    }
  }, [channelId, parentId]);

  useEffect(() => {
    let active = true;
    let synchronizing = true;
    let buffer: MessageEvent[] = [];
    const controller = new AbortController();
    const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false, withCredentials: true });
    socketRef.current = socket;
    const query = parentId ? `?parentId=${parentId}` : "";

    function fail(error: unknown) {
      if (!active || controller.signal.aborted) return;
      setError(messageOf(error));
      if (error instanceof HttpError && [401, 403].includes(error.status)) {
        setMessages([]);
        setDenied(true);
        socket.disconnect();
      }
    }

    async function refresh() {
      const version = ++generation.current;
      synchronizing = true;
      try {
        const page = await request<MessagePage>(base + query, { signal: controller.signal });
        if (!active || version !== generation.current) return;
        setMessages(buffer.reduce((rows, event) => applyEvent(rows, event, parentId), page.messages));
        buffer = [];
        setNextCursor(page.nextCursor);
        setError("");
        setDenied(false);
        markRead();
      } catch (error) {
        if (version === generation.current) fail(error);
      } finally {
        if (active && version === generation.current) {
          synchronizing = false;
          setLoading(false);
        }
      }
    }
    refreshRef.current = () => { void refresh(); };

    socket.on("connect", () => {
      socket.timeout(10_000).emit("channel:join", { channelId }, (timeout, result) => {
        if (!active) return;
        if (timeout || !result?.ok) {
          setConnected(false);
          setError(!result?.ok && result ? result.error : "Live connection timed out. Retry to reconnect.");
          return;
        }
        setConnected(true);
        void refresh();
      });
    });

    socket.on("typing", event => {
      if (event.channelId !== channelId || parentId) return;
      setTyping(current => ({ ...current, [event.userId]: { name: event.name, until: Date.now() + TYPING_TTL_MS } }));
    });

    const handleNewMessage = (event: MessageEvent) => {
      if (event.message.channelId !== channelId) return;
      const authorId = event.message.authorId ?? event.message.sender.id;
      setTyping(current => Object.fromEntries(Object.entries(current).filter(([userId]) => userId !== authorId)));
      if (synchronizing) buffer.push(event);
      setMessages(current => applyEvent(current, event, parentId));
      if (document.hasFocus()) markRead();
    };

    socket.on("message:created", handleNewMessage);

    socket.on("message:updated", ({ message }) => {
      if (message.channelId !== channelId) return;
      setMessages(current => current.map(m => (m.id === message.id ? { ...m, ...message } : m)));
    });

    socket.on("message:deleted", ({ messageId }) => {
      setMessages(current =>
        current.map(m =>
          m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), body: "This message was deleted" } : m
        )
      );
    });

    socket.on("reaction:updated", ({ messageId, reactions }) => {
      setMessages(current => current.map(m => (m.id === messageId ? { ...m, reactions } : m)));
    });

    socket.on("access:revoked", () => {
      if (!active) return;
      generation.current++;
      controller.abort();
      setMessages([]);
      setDenied(true);
      setConnected(false);
      setError("Your access changed. Refresh the workspace to continue.");
      socket.disconnect();
    });

    socket.on("disconnect", () => {
      if (active) {
        setConnected(false);
        void refresh();
      }
    });

    socket.on("connect_error", () => {
      if (active) {
        setConnected(false);
        setError("Live connection unavailable. History and sending still work; reconnecting…");
      }
    });

    void refresh();
    socket.connect();

    return () => {
      active = false;
      generation.current++;
      controller.abort();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [base, channelId, parentId, markRead]);

  // Drop typing signals that have run out.
  const typingCount = Object.keys(typing).length;
  useEffect(() => {
    if (!typingCount) return;
    const timer = setInterval(() => {
      setTyping(current => {
        const now = Date.now();
        const live = Object.entries(current).filter(([, entry]) => entry.until > now);
        return live.length === Object.keys(current).length ? current : Object.fromEntries(live);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typingCount]);

  // Tells others in channel this person is typing, at most every 2 seconds.
  function notifyTyping() {
    if (parentId || !socketRef.current?.connected || Date.now() - lastTypingSent.current < 2000) return;
    lastTypingSent.current = Date.now();
    socketRef.current.emit("typing", { channelId });
  }

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    const version = generation.current;
    setLoadingOlder(true);
    try {
      const query = new URLSearchParams({ cursor: nextCursor, ...(parentId ? { parentId } : {}) });
      const page = await request<MessagePage>(`${base}?${query}`);
      if (version !== generation.current) return;
      setMessages(current => mergeMessages(current, page.messages));
      setNextCursor(page.nextCursor);
    } catch (error) {
      if (version === generation.current) setError(messageOf(error));
    } finally {
      setLoadingOlder(false);
    }
  }

  function append(message: ChatMessage) {
    setMessages(current => mergeMessages(current, [message]));
  }

  function updateMessageStatus(clientId: string, status: "sending" | "failed" | "sent", confirmed?: ChatMessage) {
    setMessages(current => {
      if (confirmed) {
        return mergeMessages(current, [{ ...confirmed, status: "sent" }]);
      }
      return current.map(m => {
        if ((m.clientId || m.clientMessageId) === clientId) {
          return { ...m, status };
        }
        return m;
      });
    });
  }

  async function react(messageId: string, emoji: string) {
    if (socketRef.current?.connected) {
      socketRef.current.emit("reaction:toggle", { messageId, emoji });
    } else {
      await request(`/api/messages/${messageId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
    }
  }

  async function edit(messageId: string, body: string) {
    if (socketRef.current?.connected) {
      socketRef.current.emit("message:edit", { messageId, body });
    } else {
      await request(`/api/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    }
  }

  async function remove(messageId: string) {
    if (socketRef.current?.connected) {
      socketRef.current.emit("message:delete", { messageId });
    } else {
      await request(`/api/messages/${messageId}`, {
        method: "DELETE",
      });
    }
  }

  async function pin(messageId: string) {
    return request<{ messageId: string; channelId: string; pinned: boolean }>(
      `/api/messages/${messageId}/pin`,
      { method: "POST" }
    );
  }

  return {
    messages,
    loading,
    loadingOlder,
    error,
    connected,
    denied,
    nextCursor,
    loadOlder,
    notifyTyping,
    markRead,
    typing: typingText(Object.values(typing).map(entry => entry.name)),
    refresh: () => refreshRef.current(),
    append,
    updateMessageStatus,
    react,
    edit,
    remove,
    pin,
    socket: socketRef.current,
  };
}
