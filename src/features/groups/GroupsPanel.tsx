"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import { messageOf, request } from "@/lib/client-http";
import styles from "../people/People.module.css";

type Member = { id: string; name: string | null; email: string | null };
type Group = { id: string; name: string; handle: string; mention: string; members: Member[] };

export default function GroupsPanel({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [people, setPeople] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    request<{ groups: Group[] }>(`/api/workspaces/${workspaceId}/groups`).then(result => setGroups(result.groups)).catch(cause => setError(messageOf(cause)));
    request<{ people: Array<Member> }>(`/api/workspaces/${workspaceId}/people`).then(result => setPeople(result.people)).catch(() => undefined);
  }, [workspaceId]);
  useEffect(() => { load(); }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await request(`/api/workspaces/${workspaceId}/groups`, { method: "POST", body: JSON.stringify({ name, handle, userIds: picked }) });
      setName(""); setHandle(""); setPicked([]);
      load();
    } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  };

  const remove = async (group: Group) => {
    if (!window.confirm(`Delete @${group.handle}? Mentions of this group will no longer expand.`)) return;
    try {
      await request(`/api/workspaces/${workspaceId}/groups/${group.id}`, { method: "DELETE" });
      load();
    } catch (cause) { setError(messageOf(cause)); }
  };

  return <section className={styles.groups} aria-labelledby="groups-heading">
    <h2 id="groups-heading">User groups</h2>
    <p className={styles.muted}>Mention a group with @handle to notify its members who are in the channel.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {canManage && <form className={styles.groupForm} onSubmit={event => void create(event)}>
      <Input required maxLength={80} placeholder="Engineering" value={name} onChange={event => setName(event.target.value)} aria-label="Group name" />
      <Input required maxLength={32} placeholder="eng" value={handle} onChange={event => setHandle(event.target.value.toLowerCase())} aria-label="Handle" />
      <select multiple aria-label="Members" value={picked} onChange={event => setPicked([...event.target.selectedOptions].map(option => option.value))}>
        {people.map(person => <option key={person.id} value={person.id}>{person.name ?? person.email}</option>)}
      </select>
      <Button variant="primary" disabled={busy}><Plus size={14} /> Create group</Button>
    </form>}
    <ul className={styles.groupList}>
      {(groups ?? []).map(group => <li key={group.id}>
        <strong>@{group.handle}</strong>
        <span>{group.name} · {group.members.map(member => member.name ?? member.email).join(", ") || "No members"}</span>
        {canManage && <button type="button" onClick={() => void remove(group)} aria-label={`Delete ${group.handle}`}><Trash2 size={14} /></button>}
      </li>)}
    </ul>
  </section>;
}
