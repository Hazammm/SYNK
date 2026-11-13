"use client";

import { useSyncExternalStore } from "react";
export type ThemeName = "black" | "white" | "forest" | "lavender";
export const THEMES: { id: ThemeName; label: string }[] = [
  { id: "black", label: "Black" }, { id: "white", label: "White" }, { id: "forest", label: "Forest" }, { id: "lavender", label: "Lavender" },
];
const themes = THEMES.map(theme => theme.id);
const eventName = "synk-theme-change";

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem("synk-theme", theme);
  window.dispatchEvent(new Event(eventName));
}

export function useTheme(): ThemeName {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(eventName, notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(eventName, notify);
        window.removeEventListener("storage", notify);
      };
    },
    () => {
      const theme = document.documentElement.dataset.theme;
      return themes.includes(theme as ThemeName) ? theme as ThemeName : "black";
    },
    () => "black",
  );
}
