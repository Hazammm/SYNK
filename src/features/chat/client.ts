"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { ChatMessage, ClientEvents, MessageEvent, MessagePage, ServerEvents } from "../../lib/chat-types";

export class HttpError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new HttpError(body.error ?? "Request failed. Please try again.", response.status);
  return body as T;
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const previous = byId.get(message.id);
    byId.set(message.id, { ...message, replyCount: Math.max(previous?.replyCount ?? 0, message.replyCount) });
  }
  return [...byId.values()].sort((a, b) => a.createdAt === b.createdAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.createdAt < b.createdAt ? -1 : 1);
}

function applyEvent(messages: ChatMessage[], event: MessageEvent, parentId: string | null) {
  if (event.message.parentId === parentId) return mergeMessages(messages, [event.message]);
  if (parentId === null && event.message.parentId && event.parentReplyCount !== undefined) {
    return messages.map(message => message.id === event.message.parentId ? { ...message, replyCount: Math.max(message.replyCount, event.parentReplyCount!) } : message);
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
  const refreshRef = useRef<() => void>(() => {});
  const base = `/api/channels/${channelId}/messages`;

  useEffect(() => {
    let active = true;
    let synchronizing = true;
    let buffer: MessageEvent[] = [];
    const controller = new AbortController();
    const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false, withCredentials: true });
    const query = parentId ? `?parentId=${parentId}` : "";

    function fail(error: unknown) {
      if (!active || controller.signal.aborted) return;
      setError(messageOf(error));
      if (error instanceof HttpError && [401, 403].includes(error.status)) {
        setMessages([]); setDenied(true); socket.disconnect();
      }
    }
    async function refresh() {
      const version = ++generation.current;
      synchronizing = true;
      try {
        const page = await request<MessagePage>(base + query, { signal: controller.signal });
        if (!active || version !== generation.current) return;
        // Reset to the newest page on reconnect, then page backwards. This cannot leave a hidden gap.
        setMessages(buffer.reduce((rows, event) => applyEvent(rows, event, parentId), page.messages));
        buffer = [];
        setNextCursor(page.nextCursor); setError(""); setDenied(false);
      } catch (error) { if (version === generation.current) fail(error); }
      finally { if (active && version === generation.current) { synchronizing = false; setLoading(false); } }
    }
    refreshRef.current = () => { void refresh(); };
    socket.on("connect", () => {
      socket.timeout(10_000).emit("channel:join", { channelId }, (timeout, result) => {
        if (!active) return;
        if (timeout || !result?.ok) { setConnected(false); setError(!result?.ok && result ? result.error : "Live connection timed out. Retry to reconnect."); return; }
        setConnected(true);
        void refresh();
      });
    });
    socket.on("message:created", event => {
      if (event.message.channelId !== channelId) return;
      if (synchronizing) buffer.push(event);
      setMessages(current => applyEvent(current, event, parentId));
    });
    socket.on("access:revoked", () => {
      if (!active) return;
      generation.current++;
      controller.abort();
      setMessages([]); setDenied(true); setConnected(false);
      setError("Your access changed. Refresh the workspace to continue."); socket.disconnect();
    });
    socket.on("disconnect", () => { if (active) { setConnected(false); void refresh(); } });
    socket.on("connect_error", () => { if (active) { setConnected(false); setError("Live connection unavailable. History and sending still work; reconnecting…"); } });
    void refresh();
    socket.connect();
    return () => {
      active = false;
      // This is a request version counter, not a DOM ref. Invalidate outstanding pagination on cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      controller.abort(); socket.removeAllListeners(); socket.disconnect();
    };
  }, [base, channelId, parentId]);

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    const version = generation.current;
    setLoadingOlder(true);
    try {
      const query = new URLSearchParams({ cursor: nextCursor, ...(parentId ? { parentId } : {}) });
      const page = await request<MessagePage>(`${base}?${query}`);
      if (version !== generation.current) return;
      setMessages(current => mergeMessages(current, page.messages)); setNextCursor(page.nextCursor);
    } catch (error) { if (version === generation.current) setError(messageOf(error)); }
    finally { setLoadingOlder(false); }
  }
  return { messages, loading, loadingOlder, error, connected, denied, nextCursor, loadOlder,
    refresh: () => refreshRef.current(), append: (message: ChatMessage) => setMessages(current => mergeMessages(current, [message])) };
}
