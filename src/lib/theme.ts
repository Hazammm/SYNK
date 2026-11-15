"use client";

import { useSyncExternalStore } from "react";

export type ThemeName = "light" | "dark";
export const THEMES: { id: ThemeName; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Bright surfaces for well-lit rooms" },
  { id: "dark", label: "Dark", hint: "Dim surfaces that are easy on the eyes" },
];
const eventName = "synk-theme-change";
export const THEME_KEY = "synk-theme";

// Runs before first paint (see app/layout.tsx). Earlier builds stored black, white, forest or lavender;
// those map onto the two themes so nobody's saved choice flips. With nothing saved, the system setting decides.
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var m={black:"dark",forest:"dark",white:"light",lavender:"light",light:"light",dark:"dark"};var v=m[t]||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=v}catch(e){}})()`;

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_KEY, theme);
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
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}
