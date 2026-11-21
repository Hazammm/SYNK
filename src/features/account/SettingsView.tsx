"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { BarChart3, Bell, Bot, Building2, Palette, Shield, Smile, UserRound, Users } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import { applyTheme, THEMES, useTheme } from "@/lib/theme";
import { messageOf, request } from "@/lib/client-http";
import WorkspaceMembers from "@/features/workspaces/WorkspaceMembers";
import WorkspaceAdmin from "@/features/workspaces/WorkspaceAdmin";
import { DesktopNotifications, PauseSettings, ProfileDetails, Section, StatusSettings, TwoFactor, useSaving } from "./PersonalSettings";
import { SETTINGS_SECTIONS, type Account, type NotificationPreferences, type SettingsSection } from "@/lib/account-types";
import styles from "./Settings.module.css";

const SECTIONS: Record<SettingsSection, { label: string; icon: typeof UserRound }> = {
  profile: { label: "Profile", icon: UserRound },
  status: { label: "Status", icon: Smile },
  notifications: { label: "Notifications", icon: Bell },
  appearance: { label: "Appearance", icon: Palette },
  security: { label: "Password and security", icon: Shield },
  workspaces: { label: "Workspaces", icon: Building2 },
  members: { label: "Members", icon: Users },
  admin: { label: "Workspace admin", icon: BarChart3 },
  assistant: { label: "AI assistant", icon: Bot },
};
const sectionOf = (value?: string): SettingsSection => SETTINGS_SECTIONS.find(section => section === value?.toLowerCase()) ?? "profile";

// The workspace in the URL, when settings are opened inside one; Members is only shown then.
type CurrentWorkspace = { id: string; role: "ADMIN" | "MEMBER"; userId: string };

export default function SettingsView({ initialSection, workspace, inviteDeliveryFailed = false, welcomeEmailFailed = false }: {
  initialSection?: string;
  workspace?: CurrentWorkspace;
  inviteDeliveryFailed?: boolean;
  welcomeEmailFailed?: boolean;
}) {
  const sections = SETTINGS_SECTIONS.filter(id => (id !== "members" || workspace) && (id !== "admin" || workspace?.role === "ADMIN"));
  const pick = (value?: string) => { const found = sectionOf(value); return sections.includes(found) ? found : "profile"; };
  const [section, setSection] = useState(pick(initialSection));
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<{ account: Account }>("/api/me", { signal: controller.signal })
      .then(result => { setAccount(result.account); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [revision]);
  // The profile menu links straight to a section, including when this page is already open.
  const [linkedSection, setLinkedSection] = useState(initialSection);
  if (linkedSection !== initialSection) { setLinkedSection(initialSection); setSection(pick(initialSection)); }
  function choose(next: SettingsSection) {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set("section", next);
    window.history.replaceState(null, "", url);
  }
  const reload = () => setRevision(value => value + 1);

  return <div className={styles.page}>
    <header className={styles.header}><h1>Settings</h1><p>Manage your account, how Synk looks, and the workspaces you belong to.</p></header>
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Settings sections">
        {sections.map(id => { const { label, icon: Icon } = SECTIONS[id]; return <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => choose(id)}><Icon size={16} aria-hidden="true" /> {label}</button>; })}
      </nav>
      <div className={styles.body}>
        {welcomeEmailFailed && <p role="alert" className={styles.error}>Your account is ready, but the welcome email could not be sent.</p>}
        {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={reload}>Retry</button></p>}
        {!account && !error && <p role="status" className={styles.muted}>Loading your settings…</p>}
        {account && <>
          {section === "profile" && <ProfileDetails account={account} onSaved={reload} />}
          {section === "status" && <StatusSettings account={account} onSaved={reload} />}
          {section === "notifications" && <><Notifications account={account} onSaved={reload} /><PauseSettings account={account} onSaved={reload} /><DesktopNotifications /></>}
          {section === "appearance" && <Appearance />}
          {section === "security" && <><Security account={account} onChanged={reload} /><TwoFactor account={account} onChanged={reload} /></>}
          {section === "workspaces" && <Workspaces account={account} onChanged={reload} />}
          {section === "admin" && workspace?.role === "ADMIN" && <WorkspaceAdmin workspaceId={workspace.id} />}
          {section === "members" && workspace && <WorkspaceMembers workspaceId={workspace.id} role={workspace.role} userId={workspace.userId} inviteDeliveryFailed={inviteDeliveryFailed} />}
          {section === "assistant" && <Assistant account={account} />}
        </>}
      </div>
    </div>
  </div>;
}

// Saving state shared by the forms: busy, a success note and an error, announced to screen readers.
const NOTIFICATION_OPTIONS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: "assigned", label: "Ticket assignments", description: "When someone assigns a ticket to you." },
  { key: "comments", label: "Comments on your tickets", description: "When someone comments on a ticket assigned to you." },
  { key: "mentions", label: "Mentions and direct messages", description: "When someone @mentions you in chat or on a ticket, or sends you a direct message." },
  { key: "replies", label: "Thread replies", description: "When someone replies to a thread you started or replied in." },
  { key: "reactions", label: "Reactions", description: "When someone reacts to your message." },
];

function Notifications({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [prefs, setPrefs] = useState(account.notifications);
  const { busy, run, feedback } = useSaving();
  const toggle = (key: keyof NotificationPreferences, value: boolean) => {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value }); // shown straight away, put back if saving fails
    void run(async () => {
      try { await request("/api/me", { method: "PATCH", body: JSON.stringify({ notifications: { [key]: value } }) }); }
      catch (error) { setPrefs(previous); throw error; }
      onSaved();
      return `${NOTIFICATION_OPTIONS.find(option => option.key === key)!.label} ${value ? "turned on" : "turned off"}.`;
    });
  };
  return <Section title="Notifications" description="Choose which events appear under Alerts. Turning one off stops new alerts of that kind; existing ones stay.">
    <ul className={styles.toggles}>{NOTIFICATION_OPTIONS.map(option => <li key={option.key}>
      <label><span><strong>{option.label}</strong><small>{option.description}</small></span>
        <input type="checkbox" role="switch" checked={prefs[option.key]} disabled={busy} onChange={event => toggle(option.key, event.target.checked)} /></label>
    </li>)}</ul>
    {feedback}
  </Section>;
}

function Appearance() {
  const theme = useTheme();
  return <Section title="Appearance" description="Choose how Synk looks. This is saved in this browser.">
    <div className={styles.themes} role="radiogroup" aria-label="Theme">
      {THEMES.map(item => <button key={item.id} type="button" role="radio" aria-checked={theme === item.id} data-swatch={item.id} className={styles.theme} onClick={() => applyTheme(item.id)}>
        <span className={styles.swatch} data-swatch={item.id} aria-hidden="true"><i /><i /><i /></span><strong>{item.label}</strong><small>{item.hint}</small>
      </button>)}
    </div>
  </Section>;
}

function Security({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const password = useSaving(), sessions = useSaving();
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;
  const change = (event: React.FormEvent) => {
    event.preventDefault();
    if (mismatch) return;
    void password.run(async () => {
      const result = await request<{ signedOut: number }>("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) });
      setForm({ currentPassword: "", newPassword: "", confirm: "" }); onChanged();
      return `Password changed.${result.signedOut ? ` ${result.signedOut} other ${result.signedOut === 1 ? "session was" : "sessions were"} signed out.` : ""}`;
    });
  };
  const signOutOthers = () => {
    if (!window.confirm("Sign out of Synk on every other browser and device? This one stays signed in.")) return;
    void sessions.run(async () => {
      const result = await request<{ signedOut: number }>("/api/me/sessions", { method: "DELETE" });
      onChanged();
      return `Signed out of ${result.signedOut} other ${result.signedOut === 1 ? "session" : "sessions"}.`;
    });
  };
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: event.target.value });

  return <>
    <Section title="Password" description="Changing your password signs you out everywhere else.">
      {account.hasPassword ? <form className={styles.form} onSubmit={change}>
        <label>Current password<Input type="password" required autoComplete="current-password" value={form.currentPassword} onChange={set("currentPassword")} /></label>
        <label>New password<Input type="password" required minLength={10} maxLength={72} autoComplete="new-password" value={form.newPassword} onChange={set("newPassword")} aria-describedby="password-hint" /></label>
        <p id="password-hint" className={styles.hint}>At least 10 characters.</p>
        <label>Confirm new password<Input type="password" required autoComplete="new-password" value={form.confirm} onChange={set("confirm")} aria-invalid={mismatch} aria-describedby="confirm-hint" /></label>
        <p id="confirm-hint" className={mismatch ? styles.error : styles.hint}>{mismatch ? "The passwords do not match." : "Type the new password again."}</p>
        <div className={styles.actions}><Button variant="primary" disabled={password.busy || mismatch}>{password.busy ? "Changing…" : "Change password"}</Button>{password.feedback}</div>
      </form> : <p className={styles.notice}>You sign in with {account.providers.join(" or ") || "another provider"}, so there is no Synk password to change.</p>}
    </Section>
    <Section title="Where you're signed in" description="Sign out of browsers and devices you no longer use, or that you don't recognise.">
      <p className={styles.sessions}><strong>{account.otherSessions}</strong> other {account.otherSessions === 1 ? "session" : "sessions"} besides this one.</p>
      <div className={styles.actions}>
        <Button disabled={sessions.busy || account.otherSessions === 0} onClick={signOutOthers}>Sign out of other sessions</Button>
        <Button variant="quiet" onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out here</Button>
        {sessions.feedback}
      </div>
      <p className={styles.hint}>Forgot your password? Sign out and use <Link href="/forgot-password">Forgot password</Link> on the login page.</p>
    </Section>
  </>;
}

function Workspaces({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const router = useRouter();
  const { busy, run, feedback } = useSaving();
  const leave = (workspace: Account["workspaces"][number]) => {
    if (!window.confirm(`Leave ${workspace.name}? You lose access to its channels, projects and tickets, and are unassigned from its tickets. An admin can add you back.`)) return;
    void run(async () => {
      await request(`/api/workspaces/${workspace.id}/leave`, { method: "POST" });
      onChanged(); router.refresh();
      return `You left ${workspace.name}.`;
    });
  };
  return <Section title="Workspaces" description="The workspaces you belong to. Admins invite people from Members.">
    {account.workspaces.length ? <ul className={styles.workspaces}>{account.workspaces.map(workspace => {
      const onlyAdmin = workspace.role === "ADMIN" && workspace.adminCount <= 1;
      return <li key={workspace.id}>
        <span><strong>{workspace.name}</strong><small>{workspace.role === "ADMIN" ? "Admin" : "Member"} · {workspace.memberCount} {workspace.memberCount === 1 ? "member" : "members"}</small></span>
        <Link href={`/w/${workspace.id}/overview`}>Open</Link>
        <Button variant="quiet" disabled={busy || onlyAdmin} title={onlyAdmin ? "You are the only admin, so you can't leave yet." : undefined} onClick={() => leave(workspace)}>Leave</Button>
      </li>;
    })}</ul> : <p className={styles.notice}>You are not in a workspace yet. <Link href="/create-workspace">Create one</Link>.</p>}
    {account.workspaces.some(workspace => workspace.role === "ADMIN" && workspace.adminCount <= 1) && <p className={styles.hint}>You can&apos;t leave a workspace where you are the only admin.</p>}
    {feedback}
  </Section>;
}

function Assistant({ account }: { account: Account }) {
  const [workspaceId, setWorkspaceId] = useState("");
  const { busy, run, feedback } = useSaving();
  const remove = () => {
    const where = account.workspaces.find(workspace => workspace.id === workspaceId);
    if (!window.confirm(`Delete your Synk AI conversations${where ? ` in ${where.name}` : " in every workspace"}? This cannot be undone. Tickets the assistant created or changed are not affected.`)) return;
    void run(async () => {
      const result = await request<{ deleted: number; agentMemoryCleared: boolean }>(`/api/ai-agent/conversations${workspaceId ? `?workspaceId=${workspaceId}` : ""}`, { method: "DELETE" });
      // The panel would otherwise try to reopen a deleted conversation.
      for (const key of Object.keys(window.localStorage)) if (key.startsWith("synk-agent-conversation:")) window.localStorage.removeItem(key);
      const count = `Deleted ${result.deleted} ${result.deleted === 1 ? "conversation" : "conversations"}.`;
      return result.agentMemoryCleared ? count : `${count} The assistant service could not be reached, so its working copy will remain until it is cleared later.`;
    });
  };
  return <Section title="AI assistant" description="Synk AI can only do what you are allowed to do, and asks before changing an existing ticket. Your conversations are private to you.">
    <div className={styles.form}>
      <label>Conversations to delete<select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
        <option value="">All workspaces</option>{account.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select></label>
      <div className={styles.actions}><Button className={styles.danger} disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete conversation history"}</Button>{feedback}</div>
    </div>
    <p className={styles.hint}>Every action the assistant takes is still recorded in the workspace&apos;s audit log.</p>
  </Section>;
}
