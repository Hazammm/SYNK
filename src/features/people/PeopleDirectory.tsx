"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clock3, Mail, MapPin, MessageCircle, Phone, Search } from "lucide-react";
import { Avatar, Input } from "@/components/Primitives";
import { initialsOf } from "@/components/ProfileMenu";
import { messageOf, request } from "@/lib/client-http";
import type { DirectoryPerson } from "@/lib/people-types";
import { isPaused } from "@/lib/account-types";
import GroupsPanel from "@/features/groups/GroupsPanel";
import styles from "./People.module.css";

// "3:05 PM" in the person's own time zone, or nothing when they have not set one.
export function localTime(timezone: string, now = new Date()) {
  if (!timezone) return "";
  try { return now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone }); } catch { return ""; }
}

export default function PeopleDirectory({ workspaceId, viewerId, canManage = false }: { workspaceId: string; viewerId: string; canManage?: boolean }) {
  const [people, setPeople] = useState<DirectoryPerson[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const controller = new AbortController();
    request<{ people: DirectoryPerson[] }>(`/api/workspaces/${workspaceId}/people`, { signal: controller.signal })
      .then(result => setPeople(result.people)).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [workspaceId]);
  // Local times tick over each minute.
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);

  const titles = useMemo(() => [...new Set((people ?? []).map(person => person.title).filter(Boolean))].sort(), [people]);
  const locations = useMemo(() => [...new Set((people ?? []).map(person => person.location).filter(Boolean))].sort(), [people]);
  const needle = query.trim().toLowerCase();
  const shown = (people ?? []).filter(person =>
    (!needle || [person.name, person.email, person.title, person.location, person.status.text].some(value => value?.toLowerCase().includes(needle)))
    && (!title || person.title === title) && (!location || person.location === location) && (!onlineOnly || person.online));

  return <div className={styles.page}>
    <header className={styles.head}>
      <div><h1>People</h1><p>Everyone in this workspace, with their role, location, local time and status.</p></div>
    </header>
    <div className={styles.filters} role="search" aria-label="Filter people">
      <label className={styles.search}><Search size={15} aria-hidden="true" /><Input type="search" aria-label="Search people" placeholder="Search by name, email, title or status" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label="Title" value={title} onChange={event => setTitle(event.target.value)}><option value="">Any title</option>{titles.map(item => <option key={item}>{item}</option>)}</select>
      <select aria-label="Location" value={location} onChange={event => setLocation(event.target.value)}><option value="">Any location</option>{locations.map(item => <option key={item}>{item}</option>)}</select>
      <label className={styles.check}><input type="checkbox" checked={onlineOnly} onChange={event => setOnlineOnly(event.target.checked)} /> Online now</label>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!people && !error && <p role="status" className={styles.muted}>Loading people…</p>}
    {people && <p role="status" className={styles.muted}>{shown.length} of {people.length} {people.length === 1 ? "person" : "people"}</p>}
    <ul className={styles.grid}>{shown.map(person => {
      const time = localTime(person.timezone, now);
      return <li key={person.id} className={styles.card} aria-label={person.name ?? person.email ?? "Member"}>
        <div className={styles.top}>
          <Avatar initials={initialsOf(person.name ?? "")} src={person.image} online={person.online} paused={isPaused(person.status)} />
          <div>
            <strong>{person.name ?? "Member"}{person.pronouns && <small> ({person.pronouns})</small>}</strong>
            <span>{person.title || (person.role === "ADMIN" ? "Workspace admin" : "Member")}</span>
            <span className={styles.presence}>{person.online ? "Online" : person.status.away ? "Away" : "Offline"}{person.role === "ADMIN" && person.title ? " · Admin" : ""}</span>
          </div>
        </div>
        {(person.status.emoji || person.status.text) && <p className={styles.status}><span aria-hidden="true">{person.status.emoji}</span> {person.status.text}</p>}
        <dl className={styles.facts}>
          {person.location && <div><dt><MapPin size={14} aria-label="Location" /></dt><dd>{person.location}</dd></div>}
          {time && <div><dt><Clock3 size={14} aria-label="Local time" /></dt><dd>{time} local time</dd></div>}
          {person.email && <div><dt><Mail size={14} aria-label="Email" /></dt><dd><a href={`mailto:${person.email}`}>{person.email}</a></dd></div>}
          {person.phone && <div><dt><Phone size={14} aria-label="Phone" /></dt><dd><a href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}>{person.phone}</a></dd></div>}
        </dl>
        {person.id !== viewerId && <Link className={styles.message} href={`/w/${workspaceId}/chat?dm=${person.id}`}><MessageCircle size={14} aria-hidden="true" /> Message</Link>}
      </li>;
    })}</ul>
    <GroupsPanel workspaceId={workspaceId} canManage={canManage} />
  </div>;
}
