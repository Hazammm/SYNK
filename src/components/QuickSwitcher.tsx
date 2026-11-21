"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, FileText, Hash, LockKeyhole, Search } from "lucide-react";
import type { ChannelSummary } from "@/lib/chat-types";
import type { DirectoryPerson } from "@/lib/people-types";
import Modal from "./Modal";
import styles from "./Synk.module.css";

type Item = { id: string; label: string; hint: string; href: string; kind: "page" | "channel" | "private" | "person" };

const PAGES = [["Overview", "overview"], ["Chat", "chat"], ["Board", "board"], ["Docs", "docs"], ["Time", "time"], ["People", "people"], ["Alerts", "alerts"], ["Settings", "settings"]] as const;
const ICONS = { page: FileText, channel: Hash, private: LockKeyhole, person: AtSign };

// Ctrl+K: jump to any page, channel, direct message or person by typing part of its name.
export default function QuickSwitcher({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<Item[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const base = `/w/${workspaceId}`;

  useEffect(() => {
    input.current?.focus();
    const get = <T,>(path: string) => fetch(path, { cache: "no-store" }).then(response => (response.ok ? (response.json() as Promise<T>) : null)).catch(() => null);
    void Promise.all([
      get<{ channels: ChannelSummary[] }>(`/api/workspaces/${workspaceId}/channels`),
      get<{ people: DirectoryPerson[] }>(`/api/workspaces/${workspaceId}/people`),
    ]).then(([channels, people]) => {
      const conversations = (channels?.channels ?? []).filter(channel => !channel.archived).map((channel): Item => {
        const direct = channel.type === "DM" || channel.type === "GROUP_DM";
        return {
          id: channel.id,
          label: direct ? channel.otherUser?.name ?? channel.name ?? "Direct message" : channel.name ?? "channel",
          hint: direct ? "Direct message" : channel.joined ? "Channel" : "Channel · not joined",
          href: `${base}/chat/${channel.id}`,
          kind: direct ? "person" : channel.isPrivate ? "private" : "channel",
        };
      });
      const directWith = new Set((channels?.channels ?? []).flatMap(channel => (channel.otherUser ? [channel.otherUser.id] : [])));
      const others = (people?.people ?? []).filter(person => !directWith.has(person.id)).map((person): Item => ({
        id: person.id, label: person.name ?? person.email ?? "Member", hint: person.title || "Send a message", href: `${base}/chat?dm=${person.id}`, kind: "person",
      }));
      setLoaded([...conversations, ...others]);
    });
  }, [workspaceId, base]);

  const items = useMemo(() => {
    const pages = PAGES.map(([label, path]): Item => ({ id: path, label, hint: "Page", href: `${base}/${path}`, kind: "page" }));
    const text = query.trim().toLowerCase().replace(/^[#@]/, "");
    const all = [...pages, ...(loaded ?? [])];
    if (!text) return all.slice(0, 12);
    return all
      .filter(item => item.label.toLowerCase().includes(text))
      .sort((a, b) => Number(!b.label.toLowerCase().startsWith(text)) - Number(!a.label.toLowerCase().startsWith(text)))
      .slice(0, 12);
  }, [query, loaded, base]);
  const searchAll = query.trim().length >= 2 ? `${base}/search?q=${encodeURIComponent(query.trim())}` : "";
  const total = items.length + (searchAll ? 1 : 0);

  const go = (href: string) => { onClose(); router.push(href); };
  const choose = (index: number) => {
    if (index < items.length) go(items[index].href);
    else if (searchAll) go(searchAll);
  };

  return (
    <Modal label="Jump to" className={styles.quickDialog} onClose={onClose}>
      <div className={styles.quick}>
        <div className={styles.quickSearch}>
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-results"
            aria-activedescendant={total ? `quick-${Math.min(active, total - 1)}` : undefined}
            aria-label="Jump to a page, channel or person"
            placeholder="Jump to a page, channel or person…"
            value={query}
            onChange={event => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={event => {
              if (event.key === "ArrowDown" && total) { event.preventDefault(); setActive(current => (current + 1) % total); }
              else if (event.key === "ArrowUp" && total) { event.preventDefault(); setActive(current => (current - 1 + total) % total); }
              else if (event.key === "Enter" && total) { event.preventDefault(); choose(Math.min(active, total - 1)); }
            }}
          />
        </div>
        <ul id="quick-results" role="listbox" className={styles.quickList}>
          {items.map((item, index) => {
            const Icon = ICONS[item.kind];
            return (
              <li key={`${item.kind}-${item.id}`} id={`quick-${index}`} role="option" aria-selected={index === active} className={styles.quickItem} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
                <Icon size={15} aria-hidden="true" /><span>{item.label}</span><small>{item.hint}</small>
              </li>
            );
          })}
          {searchAll && (
            <li id={`quick-${items.length}`} role="option" aria-selected={active === items.length} className={styles.quickItem} onMouseEnter={() => setActive(items.length)} onClick={() => choose(items.length)}>
              <Search size={15} aria-hidden="true" /><span>Search everything for “{query.trim()}”</span><small>Enter</small>
            </li>
          )}
          {!loaded && <li className={styles.quickEmpty} role="status">Loading channels and people…</li>}
          {loaded && !total && <li className={styles.quickEmpty}>Nothing matches.</li>}
        </ul>
        <p className={styles.quickHint}>↑ ↓ to move · Enter to open · Esc to close</p>
      </div>
    </Modal>
  );
}
