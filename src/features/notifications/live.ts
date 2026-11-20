"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents } from "@/lib/chat-types";
import { NOTIFICATIONS_CHANGED } from "@/lib/events";

// Set in this browser when the person turns desktop notifications on in Settings.
export const DESKTOP_KEY = "synk-desktop-notifications";

// Listens for new alerts on the person's own channel: refreshes the alert count everywhere, and shows a browser
// pop-up when Synk is in the background, desktop notifications are on, and notifications are not paused.
export function useLiveAlerts(enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const socket: Socket<ServerEvents, ClientEvents> = io({ withCredentials: true });
    socket.on("notification:new", ({ announcement }) => {
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      const wanted = announcement && "Notification" in window && Notification.permission === "granted" && window.localStorage.getItem(DESKTOP_KEY) === "on";
      if (!wanted || (!document.hidden && document.hasFocus())) return;
      const popup = new Notification(announcement.title, { body: announcement.body, tag: announcement.url });
      popup.onclick = () => { window.focus(); router.push(announcement.url); popup.close(); };
    });
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [enabled, router]);
}
