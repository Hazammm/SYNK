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

// Cursor's browser injects data-cursor-ref before React hydrates, which Next reports as a
// mismatch. Ignore those attributes in development so the overlay does not fire.
export const cursorRefGuardScript = `(function(){var orig=Element.prototype.setAttribute;var origNS=Element.prototype.setAttributeNS;function hit(name){return String(name).toLowerCase()==="data-cursor-ref"}Element.prototype.setAttribute=function(name,value){if(hit(name))return;return orig.apply(this,arguments)};Element.prototype.setAttributeNS=function(ns,name,value){if(hit(name))return;return origNS.apply(this,arguments)};function stripNode(n){if(!n||n.nodeType!==1)return;if(n.hasAttribute&&n.hasAttribute("data-cursor-ref"))n.removeAttribute("data-cursor-ref");var nested=n.querySelectorAll?n.querySelectorAll("[data-cursor-ref]"):[];for(var i=0;i<nested.length;i++)nested[i].removeAttribute("data-cursor-ref")}new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var m=ms[i];if(m.type==="attributes"&&m.attributeName==="data-cursor-ref")m.target.removeAttribute("data-cursor-ref");if(m.addedNodes)for(var j=0;j<m.addedNodes.length;j++)stripNode(m.addedNodes[j])}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["data-cursor-ref"]});var existing=document.querySelectorAll("[data-cursor-ref]");for(var i=0;i<existing.length;i++)existing[i].removeAttribute("data-cursor-ref")})();`;

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
