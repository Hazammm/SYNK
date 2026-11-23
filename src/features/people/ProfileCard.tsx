"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellOff, Clock, Mail, MapPin, MessageSquare, Phone, X } from "lucide-react";
import { Avatar } from "@/components/Primitives";
import { initialsOf } from "@/components/ProfileMenu";
import { messageOf, request } from "@/lib/client-http";
import type { DirectoryPerson } from "@/lib/people-types";
import { isPaused } from "@/lib/account-types";
import { localTime } from "./PeopleDirectory";
import styles from "./ProfileCard.module.css";

const CARD_WIDTH = 300, CARD_MAX_HEIGHT = 440, GAP = 8;

// The profile someone sees after clicking a teammate's name or photo, like Slack's profile popout.
// Rendered on the page body so scrolling message lists cannot clip it.
export default function ProfileCard({ workspaceId, userId, viewerId, anchor, onClose }: { workspaceId: string; userId: string; viewerId: string; anchor: DOMRect; onClose: () => void }) {
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [error, setError] = useState("");
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    request<{ people: DirectoryPerson[] }>(`/api/workspaces/${workspaceId}/people`, { signal: controller.signal })
      .then(result => {
        const found = result.people.find(item => item.id === userId) ?? null;
        if (found) setPerson(found); else setError("This person is no longer in the workspace.");
      })
      .catch(cause => { if (!controller.signal.aborted) setError(messageOf(cause)); });
    return () => controller.abort();
  }, [workspaceId, userId, viewerId]);

  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !card.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [onClose]);

  const time = person ? localTime(person.timezone) : "";
  const position = {
    top: Math.max(GAP, Math.min(anchor.bottom + GAP, window.innerHeight - CARD_MAX_HEIGHT - GAP)),
    left: Math.max(GAP, Math.min(anchor.left, window.innerWidth - CARD_WIDTH - GAP)),
  };
  return createPortal(<aside ref={card} className={styles.card} style={position} role="dialog" aria-label={person?.name ?? "Profile"}>
    <button type="button" className={styles.close} aria-label="Close profile" onClick={onClose}><X size={15} /></button>
    {error ? <p role="alert" className={styles.muted}>{error}</p> : !person ? <p className={styles.muted}>Loading profile…</p> : <>
      <div className={styles.photo}><Avatar initials={initialsOf(person.name ?? person.email ?? "")} src={person.image} online={person.online} paused={isPaused(person.status)} /></div>
      <h2>{person.name ?? person.email ?? "Member"}{person.pronouns && <small> ({person.pronouns})</small>}</h2>
      {person.title && <p className={styles.title}>{person.title}</p>}
      {(person.status.emoji || person.status.text) && <p className={styles.status}><span aria-hidden="true">{person.status.emoji}</span> {person.status.text}</p>}
      <ul className={styles.facts}>
        <li>{person.online ? <><i className={styles.active} aria-hidden="true" /> Active</> : <><i aria-hidden="true" /> Away</>}</li>
        {isPaused(person.status) && <li><BellOff size={14} aria-hidden="true" /> Notifications paused until {new Date(person.status.pausedUntil!).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</li>}
        {time && <li><Clock size={14} aria-hidden="true" /> {time} local time</li>}
        {person.location && <li><MapPin size={14} aria-hidden="true" /> {person.location}</li>}
        {person.email && <li><Mail size={14} aria-hidden="true" /> <a href={`mailto:${person.email}`}>{person.email}</a></li>}
        {person.phone && <li><Phone size={14} aria-hidden="true" /> <a href={`tel:${person.phone.replace(/\s/g, "")}`}>{person.phone}</a></li>}
      </ul>
      {person.id === viewerId
        ? <Link className={styles.action} href={`/w/${workspaceId}/settings?section=profile`}>Edit profile</Link>
        : <Link className={styles.action} href={`/w/${workspaceId}/chat?dm=${person.id}`}><MessageSquare size={15} aria-hidden="true" /> Message</Link>}
    </>}
  </aside>, document.body);
}
