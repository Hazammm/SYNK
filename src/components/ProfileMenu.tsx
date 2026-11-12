"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Bell, ChevronDown, LogOut, Palette, Settings, Shield, UserRound } from "lucide-react";
import type { Account } from "@/lib/account-types";
import { messageOf, request } from "@/lib/client-http";
import { Avatar } from "./Primitives";
import styles from "./ProfileMenu.module.css";

export const initialsOf = (name: string | null | undefined) =>
  (name?.trim() || "Member").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

// The signed-in person's name in the header. It opens a card with their details and shortcuts into settings.
export default function ProfileMenu({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    request<{ account: Account }>("/api/me", { signal: controller.signal })
      .then(result => { setAccount(result.account); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    // Close when clicking anywhere else.
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => { controller.abort(); document.removeEventListener("mousedown", outside); };
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  const name = account?.name || userName;
  const links = [
    { section: "profile", label: "Edit profile", icon: UserRound },
    { section: "notifications", label: "Notifications", icon: Bell },
    { section: "appearance", label: "Appearance", icon: Palette },
    { section: "security", label: "Password and security", icon: Shield },
  ];

  return <div ref={root} className={styles.root} onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); close(); } }}>
    <button ref={trigger} type="button" className={styles.trigger} aria-expanded={open} aria-haspopup="dialog" aria-controls="profile-card" onClick={() => setOpen(!open)}>
      <Avatar small initials={initialsOf(userName)} />
      <span className={styles.name}>{userName}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div id="profile-card" role="dialog" aria-label="Your profile" className={styles.card}>
      <div className={styles.identity}>
        <Avatar initials={initialsOf(name)} />
        <div><strong>{name}</strong>{account?.email && <span>{account.email}</span>}</div>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!account && !error && <p role="status" className={styles.muted}>Loading your profile…</p>}
      {account && <dl className={styles.facts}>
        <div><dt>Workspaces</dt><dd>{account.workspaces.length ? account.workspaces.map(workspace => `${workspace.name} (${workspace.role === "ADMIN" ? "admin" : "member"})`).join(", ") : "None yet"}</dd></div>
        <div><dt>Signs in with</dt><dd>{[account.hasPassword && "Email and password", ...account.providers].filter(Boolean).join(", ")}</dd></div>
        <div><dt>Member since</dt><dd>{new Date(account.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</dd></div>
      </dl>}
      <nav aria-label="Settings shortcuts" className={styles.links}>
        {links.map(({ section, label, icon: Icon }) => <Link key={section} href={`/settings?section=${section}`} onClick={() => setOpen(false)}><Icon size={15} aria-hidden="true" /> {label}</Link>)}
      </nav>
      <button type="button" className={styles.signOut} onClick={() => void signOut({ callbackUrl: "/login" })}><LogOut size={15} aria-hidden="true" /> Sign out</button>
    </div>}
  </div>;
}

// The gear next to Sign out.
export function SettingsLink({ className }: { className?: string }) {
  return <Link href="/settings" className={className} aria-label="Settings" title="Settings"><Settings size={17} aria-hidden="true" /></Link>;
}
