"use client";

import { useSyncExternalStore } from "react";
import type { ThemeName } from "@/mocks/data";

const themes: ThemeName[] = ["black", "white", "forest", "lavender"];
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
