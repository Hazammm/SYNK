import type { Priority } from "@/lib/ticket-types";

export type Selection = { workspaceId?: string; projectId?: string; boardId?: string; ticket?: string; sprintId?: string };
export type TrackerView = "board" | "sprints" | "reports";
const VIEW_PATHS: Record<TrackerView, string> = { board: "/board", sprints: "/board/backlog", reports: "/board/reports" };

export const initials = (name: string | null) => (name?.trim() || "Member").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
export const PRIORITIES: { value: Priority; label: string; tone: "high" | "medium" | "done" }[] = [
  { value: "HIGH", label: "High", tone: "high" }, { value: "MEDIUM", label: "Medium", tone: "medium" }, { value: "LOW", label: "Low", tone: "done" },
];
export const priorityOf = (value: Priority) => PRIORITIES.find(item => item.value === value)!;

// Dates travel as YYYY-MM-DD. Parsing without a time zone suffix keeps them on the same calendar day locally.
export const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const localToday = () => new Date().toLocaleDateString("en-CA"); // en-CA formats as YYYY-MM-DD

export function trackerHref(view: TrackerView, selection: Selection) {
  const query = new URLSearchParams(Object.entries(selection).filter((entry): entry is [string, string] => Boolean(entry[1])));
  const base = selection.workspaceId ? `/w/${selection.workspaceId}` : "";
  return `${base}${VIEW_PATHS[view]}${query.size ? `?${query}` : ""}`;
}

// Keeps the address bar shareable without triggering a navigation.
export function syncUrl(changes: Selection) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(changes)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  window.history.replaceState(null, "", url);
}
