"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  Compass,
  Download,
  Edit2,
  FileText,
  Hash,
  LockKeyhole,
  MessageCircle,
  MessageSquare,
  Pin,
  Plus,
  Search,
  Smile,
  Ticket,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Avatar, Button, Input } from "@/components/Primitives";
import type { ChannelSummary, ChatAttachment, ChatMessage, ChatReaction, WorkspaceSummary } from "@/lib/chat-types";
import { extractPlainText } from "@/lib/validation";
import type { WorkspaceSearchResult } from "@/features/search/service";

type MessageSearchResult = Extract<WorkspaceSearchResult, { type: "message" }>;
import { messageOf, request, useMessages } from "./client";
import { RichComposer } from "./RichComposer";
import { TiptapRenderer } from "./TiptapRenderer";
import styles from "./Chat.module.css";

type Member = {
  role: "ADMIN" | "MEMBER";
  user: { id: string; name: string | null; email: string | null; image?: string | null };
};

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🚀", "👀"];

const initials = (name: string | null) =>
  (name ?? "Member")
    .split(" ")
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

function formatDateDivider(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatClockTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatWorkspace({
  initialWorkspaces,
  initialWorkspaceId,
  initialChannelId,
  startNewChannel = false,
}: {
  initialWorkspaces: WorkspaceSummary[];
  initialWorkspaceId?: string;
  initialChannelId?: string;
  startNewChannel?: boolean;
}) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [selected, setSelected] = useState(
    initialWorkspaces.find(item => item.id === initialWorkspaceId)?.id ?? initialWorkspaces[0]?.id ?? ""
  );
  const [creating, setCreating] = useState(!initialWorkspaces.length);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const workspace = workspaces.find(item => item.id === selected);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<{ workspace: WorkspaceSummary }>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setWorkspaces(current => [...current, result.workspace]);
      setSelected(result.workspace.id);
      setCreating(false);
      setName("");
      router.push(`/w/${result.workspace.id}/chat`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceBar}>
        <h1>Conversations</h1>
        {workspace && <span className={styles.workspaceName}>{workspace.name}</span>}
        <Button variant="quiet" aria-expanded={creating} onClick={() => setCreating(!creating)}>
          <Plus size={15} /> New workspace
        </Button>
      </div>
      {creating && (
        <div className={styles.modalBackdrop}>
          <form onSubmit={create} className={styles.setup}>
            <div className={styles.setupHeader}>
              <h2>{workspaces.length ? "Create a workspace" : "Bring your team together"}</h2>
              {workspaces.length > 0 && (
                <button type="button" className={styles.iconBtn} onClick={() => setCreating(false)}>
                  <X size={18} />
                </button>
              )}
            </div>
            <p>Create a workspace to start chatting, or ask an admin to invite your email address.</p>
            <label>
              Workspace name
              <Input
                required
                maxLength={80}
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="e.g. Synk FYP"
              />
            </label>
            <div className={styles.setupFooter}>
              <Button variant="primary" disabled={busy}>
                {busy ? "Creating…" : "Create workspace"}
              </Button>
            </div>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
          </form>
        </div>
      )}
      {workspace && (
        <WorkspaceChannels
          key={workspace.id}
          workspace={workspace}
          initialChannelId={initialChannelId}
          startCreating={startNewChannel}
        />
      )}
    </div>
  );
}

function WorkspaceChannels({
  workspace,
  initialChannelId,
  startCreating,
}: {
  workspace: WorkspaceSummary;
  initialChannelId?: string;
  startCreating: boolean;
}) {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [selected, setSelected] = useState(initialChannelId ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(startCreating);
  const [browsing, setBrowsing] = useState(false);
  const [startingDm, setStartingDm] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [workspaceMembers, setWorkspaceMembers] = useState<Member[]>([]);

  // Split into Channels vs Direct Messages
  const textChannels = useMemo(
    () => channels.filter(c => c.type === "PUBLIC" || c.type === "PRIVATE"),
    [channels]
  );
  const directMessages = useMemo(
    () => channels.filter(c => c.type === "DM" || c.type === "GROUP_DM"),
    [channels]
  );

  const channel = channels.find(item => item.id === selected);

  // Sync selected channel to URL
  const selectChannel = useCallback(
    (channelId: string) => {
      setSelected(channelId);
      router.push(`/w/${workspace.id}/chat/${channelId}`, { scroll: false });
    },
    [router, workspace.id]
  );

  useEffect(() => {
    const controller = new AbortController();
    request<{ channels: ChannelSummary[] }>(`/api/workspaces/${workspace.id}/channels`, {
      signal: controller.signal,
    })
      .then(result => {
        setChannels(result.channels);
        setSelected(current => {
          if (initialChannelId && result.channels.some(item => item.id === initialChannelId)) {
            return initialChannelId;
          }
          if (current && result.channels.some(item => item.id === current)) {
            return current;
          }
          const defaultCh =
            result.channels.find(item => item.isDefault) ??
            result.channels.find(item => item.joined) ??
            result.channels[0];
          return defaultCh ? defaultCh.id : "";
        });
        setError("");
      })
      .catch(err => {
        if (!controller.signal.aborted) setError(messageOf(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspace.id, revision, initialChannelId]);

  useEffect(() => {
    request<{ members: Member[] }>(`/api/workspaces/${workspace.id}/members`)
      .then(res => setWorkspaceMembers(res.members))
      .catch(() => {});
  }, [workspace.id]);

  async function createChannelSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ channel: ChannelSummary }>(`/api/workspaces/${workspace.id}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          isPrivate: form.get("isPrivate") === "on",
        }),
      });
      setChannels(current => [...current, result.channel]);
      selectChannel(result.channel.id);
      setCreating(false);
      setRevision(value => value + 1);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function joinChannelAction() {
    if (!channel) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/channels/${channel.id}/join`, { method: "POST" });
      setRevision(value => value + 1);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function handleChannelTopicUpdated(updated: ChannelSummary) {
    setChannels(current => current.map(c => (c.id === updated.id ? { ...c, topic: updated.topic } : c)));
  }

  return (
    <>
      <div className={styles.columns}>
        <aside className={styles.channels}>
          {/* CHANNELS SECTION */}
          <div className={styles.section}>
            <div className={styles.sideHeading}>
              <strong>Channels</strong>
              <div className={styles.headingActions}>
                <button
                  className={styles.iconBtn}
                  aria-label="Browse channels"
                  title="Browse channels"
                  onClick={() => setBrowsing(true)}
                >
                  <Compass size={15} />
                </button>
                <button
                  className={styles.iconBtn}
                  aria-label="Create channel"
                  title="Create channel"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {loading && <p className={styles.role}>Loading channels…</p>}

            {textChannels.map(item => {
              const isActive = selected === item.id;
              const hasUnread = !isActive && (item.unreadCount ?? 0) > 0;
              const hasMentions = !isActive && (item.mentionCount ?? 0) > 0;

              return (
                <button
                  key={item.id}
                  className={`${styles.channel} ${isActive ? styles.active : ""} ${hasUnread ? styles.hasUnread : ""}`}
                  onClick={() => selectChannel(item.id)}
                >
                  {item.isPrivate ? <LockKeyhole size={15} /> : <Hash size={15} />}
                  <span className={styles.channelName}>{item.name}</span>
                  <div className={styles.channelBadges}>
                    {!item.joined && <small className={styles.joinBadge}>Join</small>}
                    {hasMentions && <span className={styles.mentionBadge}>@{item.mentionCount}</span>}
                    {hasUnread && !hasMentions && <span className={styles.unreadBadge}>{item.unreadCount}</span>}
                  </div>
                </button>
              );
            })}

            {!loading && !textChannels.length && (
              <p className={styles.role}>No channels yet. Create your first one.</p>
            )}
          </div>

          {/* DIRECT MESSAGES SECTION */}
          <div className={styles.section}>
            <div className={styles.sideHeading}>
              <strong>Direct Messages</strong>
              <div className={styles.headingActions}>
                <button
                  className={styles.iconBtn}
                  aria-label="Start direct message"
                  title="Start direct message"
                  onClick={() => setStartingDm(true)}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {directMessages.map(item => {
              const isActive = selected === item.id;
              const displayName = item.otherUser?.name ?? item.name ?? "Direct Message";
              const isOnline = item.otherUser ? onlineUserIds.has(item.otherUser.id) : false;
              const hasUnread = !isActive && (item.unreadCount ?? 0) > 0;
              const hasMentions = !isActive && (item.mentionCount ?? 0) > 0;

              return (
                <button
                  key={item.id}
                  className={`${styles.dmItem} ${isActive ? styles.active : ""} ${hasUnread ? styles.hasUnread : ""}`}
                  onClick={() => selectChannel(item.id)}
                >
                  <div className={styles.dmAvatarWrapper}>
                    <Avatar small initials={initials(displayName)} />
                    <span className={styles.presenceDot} data-online={isOnline} />
                  </div>
                  <span className={styles.channelName}>{displayName}</span>
                  <div className={styles.channelBadges}>
                    {hasMentions && <span className={styles.mentionBadge}>@{item.mentionCount}</span>}
                    {hasUnread && !hasMentions && <span className={styles.unreadBadge}>{item.unreadCount}</span>}
                  </div>
                </button>
              );
            })}

            {!loading && !directMessages.length && (
              <button className={styles.channel} onClick={() => setStartingDm(true)}>
                <MessageSquare size={15} />
                <span>Start a conversation</span>
              </button>
            )}
          </div>

          {/* SIDEBAR FOOTER */}
          <div className={styles.sidebarFooter}>
            <Button aria-expanded={showMembers} onClick={() => setShowMembers(!showMembers)}>
              <Users size={15} /> Workspace members
            </Button>
            <small className={styles.role}>
              {workspace.role === "ADMIN" ? "Workspace admin" : "Workspace member"}
            </small>
          </div>
        </aside>

        {/* MAIN CHAT CONTENT */}
        <div className={styles.content}>
          {error && (
            <div role="alert" className={styles.error}>
              <span>{error}</span>
              <button onClick={() => setRevision(value => value + 1)}>Retry</button>
            </div>
          )}

          {/* CREATE CHANNEL MODAL */}
          {creating && (
            <div className={styles.modalBackdrop}>
              <form onSubmit={createChannelSubmit} className={styles.setup}>
                <div className={styles.setupHeader}>
                  <h2>Create a channel</h2>
                  <button type="button" className={styles.iconBtn} onClick={() => setCreating(false)}>
                    <X size={18} />
                  </button>
                </div>
                <label>
                  Channel name
                  <Input
                    name="name"
                    placeholder="e.g. development"
                    required
                    maxLength={60}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  />
                </label>
                <label>
                  Description
                  <Input name="description" maxLength={240} placeholder="What is this channel for?" />
                </label>
                <label className={styles.check}>
                  <input type="checkbox" name="isPrivate" /> Private channel
                </label>
                <p>Private channels are visible only to invited members.</p>
                <div className={styles.setupFooter}>
                  <Button type="button" variant="quiet" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                  <Button disabled={busy} variant="primary">
                    {busy ? "Creating…" : "Create channel"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* BROWSE CHANNELS MODAL */}
          {browsing && (
            <div className={styles.modalBackdrop}>
              <div className={styles.setup}>
                <div className={styles.setupHeader}>
                  <h2>Browse channels</h2>
                  <button type="button" className={styles.iconBtn} onClick={() => setBrowsing(false)}>
                    <X size={18} />
                  </button>
                </div>
                <ul className={styles.members}>
                  {textChannels.map(item => (
                    <li key={item.id}>
                      {item.isPrivate ? <LockKeyhole size={18} /> : <Hash size={18} />}
                      <div className={styles.memberInfo}>
                        <strong>#{item.name}</strong>
                        <small>{item.description || "No description"} · {item.memberCount} members</small>
                      </div>
                      {item.joined ? (
                        <Button
                          variant="quiet"
                          onClick={() => {
                            selectChannel(item.id);
                            setBrowsing(false);
                          }}
                        >
                          View
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          onClick={async () => {
                            try {
                              await request(`/api/channels/${item.id}/join`, { method: "POST" });
                              setRevision(r => r + 1);
                              selectChannel(item.id);
                              setBrowsing(false);
                            } catch (e) {
                              setError(messageOf(e));
                            }
                          }}
                        >
                          Join
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* START A DIRECT MESSAGE MODAL */}
          {startingDm && (
            <StartDmModal
              workspaceId={workspace.id}
              onClose={() => setStartingDm(false)}
              onDmCreated={dmChannel => {
                setChannels(current =>
                  current.some(c => c.id === dmChannel.id) ? current : [...current, dmChannel]
                );
                selectChannel(dmChannel.id);
                setStartingDm(false);
              }}
            />
          )}

          {/* WORKSPACE MEMBERS MODAL */}
          {showMembers && (
            <div className={styles.modalBackdrop}>
              <Members
                workspace={workspace}
                channel={channel}
                onClose={() => setShowMembers(false)}
                onAdded={() => setRevision(value => value + 1)}
              />
            </div>
          )}

          {/* ACTIVE CHANNEL VIEW OR EMPTY/JOIN VIEW */}
          {channel?.joined ? (
            <ChannelView
              key={channel.id}
              channel={channel}
              workspaceMembers={workspaceMembers}
              onTopicUpdated={handleChannelTopicUpdated}
              onOpenMembers={() => setShowMembers(true)}
              onUserPresenceChange={setOnlineUserIds}
              onJumpToChannel={selectChannel}
            />
          ) : channel ? (
            <div className={styles.empty}>
              <Hash size={32} />
              <h2>Join #{channel.name}</h2>
              <p>{channel.description || "Join the conversation to read and send messages."}</p>
              <Button disabled={busy} variant="primary" onClick={joinChannelAction}>
                Join channel
              </Button>
            </div>
          ) : !loading ? (
            <div className={styles.empty}>
              <MessageCircle size={32} />
              <h2>Start a conversation</h2>
              <p>Select or create a channel from the sidebar.</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function StartDmModal({
  workspaceId,
  onClose,
  onDmCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onDmCreated: (channel: ChannelSummary) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    request<{ members: Member[] }>(`/api/workspaces/${workspaceId}/members`)
      .then(res => setMembers(res.members))
      .catch(e => setError(messageOf(e)))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const filtered = members.filter(
    m =>
      m.user.name?.toLowerCase().includes(query.toLowerCase()) ||
      m.user.email?.toLowerCase().includes(query.toLowerCase())
  );

  async function startWithUser(userId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await request<{ channel: ChannelSummary }>(`/api/workspaces/${workspaceId}/dms`, {
        method: "POST",
        body: JSON.stringify({ userIds: [userId] }),
      });
      onDmCreated(res.channel);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.setup}>
        <div className={styles.setupHeader}>
          <h2>Direct Messages</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p>Pick a teammate in your workspace to start a conversation.</p>
        <Input
          placeholder="Search members by name or email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {loading && <p className={styles.role}>Loading members…</p>}
        <ul className={styles.members}>
          {filtered.map(member => (
            <li key={member.user.id}>
              <Avatar small initials={initials(member.user.name)} />
              <div className={styles.memberInfo}>
                <strong>{member.user.name}</strong>
                <small>{member.user.email}</small>
              </div>
              <Button disabled={busy} variant="quiet" onClick={() => startWithUser(member.user.id)}>
                Chat
              </Button>
            </li>
          ))}
          {!loading && !filtered.length && (
            <p className={styles.role}>No members found.</p>
          )}
        </ul>
      </div>
    </div>
  );
}

function Members({
  workspace,
  channel,
  onClose,
  onAdded,
}: {
  workspace: WorkspaceSummary;
  channel?: ChannelSummary;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<{ members: Member[] }>(`/api/workspaces/${workspace.id}/members`, {
      signal: controller.signal,
    })
      .then(result => setMembers(result.members))
      .catch(err => {
        if (!controller.signal.aborted) setError(messageOf(err));
      });
    return () => controller.abort();
  }, [workspace.id, revision]);

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      setRevision(value => value + 1);
      onAdded();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.setup}>
      <div className={styles.setupHeader}>
        <h2>Workspace members</h2>
        <button type="button" className={styles.iconBtn} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {workspace.role === "ADMIN" && (
        <form
          className={styles.memberForm}
          onSubmit={event => {
            event.preventDefault();
            void act(
              () =>
                request(`/api/workspaces/${workspace.id}/members`, {
                  method: "POST",
                  body: JSON.stringify({ email }),
                }),
              "Teammate added. They can now join public channels."
            );
          }}
        >
          <label>
            Registered teammate’s email
            <Input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              placeholder="teammate@example.com"
            />
          </label>
          <Button disabled={busy}>Add to workspace</Button>
        </form>
      )}

      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status">{notice}</p>}

      <ul className={styles.members}>
        {members.map(member => (
          <li key={member.user.id}>
            <Avatar small initials={initials(member.user.name)} />
            <div className={styles.memberInfo}>
              <strong>{member.user.name}</strong>
              <small>{member.user.email} · {member.role.toLowerCase()}</small>
            </div>
            {channel?.canManageMembers && channel.joined && (
              <Button
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      request(`/api/channels/${channel.id}/members`, {
                        method: "POST",
                        body: JSON.stringify({ userId: member.user.id }),
                      }),
                    `Added to #${channel.name}.`
                  )
                }
              >
                Add to #{channel.name}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChannelView({
  channel,
  workspaceMembers,
  onTopicUpdated,
  onOpenMembers,
  onUserPresenceChange,
  onJumpToChannel,
}: {
  channel: ChannelSummary;
  workspaceMembers: Member[];
  onTopicUpdated: (updated: ChannelSummary) => void;
  onOpenMembers: () => void;
  onUserPresenceChange: (updater: (prev: Set<string>) => Set<string>) => void;
  onJumpToChannel: (channelId: string) => void;
}) {
  const [thread, setThread] = useState<ChatMessage | null>(null);
  const [rightPanel, setRightPanel] = useState<"pins" | "files" | "search" | null>(null);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState(channel.topic ?? "");
  const [savingTopic, setSavingTopic] = useState(false);

  // Esc closes thread or right panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (thread) setThread(null);
        else if (rightPanel) setRightPanel(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [thread, rightPanel]);

  async function saveTopic(e: React.FormEvent) {
    e.preventDefault();
    setSavingTopic(true);
    try {
      const res = await request<{ channel: ChannelSummary }>(`/api/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ topic: topicDraft }),
      });
      onTopicUpdated(res.channel);
      setEditingTopic(false);
    } catch {
      // Keep draft
    } finally {
      setSavingTopic(false);
    }
  }

  const displayName = channel.otherUser?.name ?? channel.name ?? "Channel";

  return (
    <div
      className={`${styles.chat} ${thread ? styles.withThread : rightPanel ? styles.withRightPanel : ""}`}
    >
      <section className={styles.mainFeed} aria-label={`Channel ${displayName}`}>
        <header className={styles.channelHeader}>
          <div className={styles.channelHeaderLeft}>
            <div className={styles.channelHeaderIcon}>
              {channel.type === "DM" || channel.type === "GROUP_DM" ? (
                <Avatar small initials={initials(displayName)} />
              ) : channel.isPrivate ? (
                <LockKeyhole size={18} />
              ) : (
                <Hash size={18} />
              )}
            </div>
            <div className={styles.channelHeaderMeta}>
              <div className={styles.channelTitleRow}>
                <h2>{displayName}</h2>
              </div>
              {/* Editable topic */}
              {editingTopic ? (
                <form onSubmit={saveTopic} className={styles.topicForm}>
                  <input
                    className={styles.topicInput}
                    value={topicDraft}
                    onChange={e => setTopicDraft(e.target.value)}
                    placeholder="Add a topic…"
                    maxLength={250}
                    autoFocus
                  />
                  <Button disabled={savingTopic} variant="primary">
                    <Check size={14} />
                  </Button>
                  <Button type="button" variant="quiet" onClick={() => setEditingTopic(false)}>
                    <X size={14} />
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className={styles.topicBtn}
                  onClick={() => {
                    setTopicDraft(channel.topic ?? "");
                    setEditingTopic(true);
                  }}
                  title="Edit topic"
                >
                  <span>{channel.topic || "Add a topic"}</span>
                  <Edit2 size={11} />
                </button>
              )}
            </div>
          </div>

          <div className={styles.channelHeaderRight}>
            <button
              className={`${styles.iconBtn} ${rightPanel === "pins" ? styles.active : ""}`}
              aria-label="Pinned messages"
              title="Pinned messages"
              onClick={() => setRightPanel(current => (current === "pins" ? null : "pins"))}
            >
              <Pin size={16} />
            </button>

            <button
              className={`${styles.iconBtn} ${rightPanel === "files" ? styles.active : ""}`}
              aria-label="Files"
              title="Files in channel"
              onClick={() => setRightPanel(current => (current === "files" ? null : "files"))}
            >
              <FileText size={16} />
            </button>

            <button
              className={`${styles.iconBtn} ${rightPanel === "search" ? styles.active : ""}`}
              aria-label="Search messages"
              title="Search"
              onClick={() => setRightPanel(current => (current === "search" ? null : "search"))}
            >
              <Search size={16} />
            </button>

            <button className={styles.headerChip} onClick={onOpenMembers}>
              <Users size={14} />
              <span>
                {channel.memberCount} {channel.memberCount === 1 ? "member" : "members"}
              </span>
            </button>
          </div>
        </header>

        <Feed
          channel={channel}
          parentId={null}
          workspaceMembers={workspaceMembers}
          onThread={setThread}
          onUserPresenceChange={onUserPresenceChange}
        />
      </section>

      {/* THREAD PANEL */}
      {thread && (
        <section className={styles.thread} aria-label="Thread">
          <header className={styles.channelHeader}>
            <div className={styles.channelTitleRow}>
              <h2>Thread</h2>
            </div>
            <button
              className={styles.iconBtn}
              aria-label="Close thread"
              onClick={() => setThread(null)}
            >
              <X size={18} />
            </button>
          </header>
          <div className={styles.threadRoot}>
            <MessageCard
              message={thread}
              workspaceId={channel.workspaceId}
              isGrouped={false}
              onReact={() => {}}
              onStartEdit={() => {}}
              onDelete={() => {}}
              onPin={() => {}}
            />
          </div>
          <Feed
            key={thread.id}
            channel={channel}
            parentId={thread.id}
            workspaceMembers={workspaceMembers}
            onUserPresenceChange={onUserPresenceChange}
          />
        </section>
      )}

      {/* RIGHT CONTEXT PANEL */}
      {!thread && rightPanel && (
        <aside className={styles.rightDrawer} aria-label="Context panel">
          <header className={styles.drawerHeader}>
            <h3>
              {rightPanel === "pins" && "Pinned Messages"}
              {rightPanel === "files" && "Shared Files"}
              {rightPanel === "search" && "Search Workspace"}
            </h3>
            <button className={styles.iconBtn} onClick={() => setRightPanel(null)}>
              <X size={16} />
            </button>
          </header>

          <div className={styles.drawerTabs}>
            <button
              className={`${styles.drawerTab} ${rightPanel === "pins" ? styles.activeTab : ""}`}
              onClick={() => setRightPanel("pins")}
            >
              Pins
            </button>
            <button
              className={`${styles.drawerTab} ${rightPanel === "files" ? styles.activeTab : ""}`}
              onClick={() => setRightPanel("files")}
            >
              Files
            </button>
            <button
              className={`${styles.drawerTab} ${rightPanel === "search" ? styles.activeTab : ""}`}
              onClick={() => setRightPanel("search")}
            >
              Search
            </button>
          </div>

          <div className={styles.drawerBody}>
            {rightPanel === "pins" && <PinnedMessagesList channelId={channel.id} />}
            {rightPanel === "files" && <ChannelFilesList channelId={channel.id} />}
            {rightPanel === "search" && (
              <SearchDrawer
                workspaceId={channel.workspaceId}
                onJumpToMessage={(targetChannelId) => {
                  onJumpToChannel(targetChannelId);
                  setRightPanel(null);
                }}
              />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function PinnedMessagesList({ channelId }: { channelId: string }) {
  const [pins, setPins] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    request<{ pins: ChatMessage[] }>(`/api/channels/${channelId}/pins`)
      .then(res => setPins(res.pins))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  if (loading) return <p className={styles.role}>Loading pins…</p>;
  if (!pins.length) return <p className={styles.role}>No pinned messages in this channel.</p>;

  return (
    <>
      {pins.map(pin => (
        <div key={pin.id} className={styles.pinCard}>
          <strong>{pin.sender?.name ?? "Member"}</strong>
          <p style={{ margin: "4px 0", color: "var(--text)" }}>{pin.body}</p>
          <small style={{ color: "var(--faint)" }}>{formatClockTime(pin.createdAt)}</small>
        </div>
      ))}
    </>
  );
}

function ChannelFilesList({ channelId }: { channelId: string }) {
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    request<{ messages: ChatMessage[] }>(`/api/channels/${channelId}/messages?limit=50`)
      .then(res => {
        const all: ChatAttachment[] = [];
        for (const m of res.messages) {
          if (m.attachments) all.push(...m.attachments);
        }
        setFiles(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  if (loading) return <p className={styles.role}>Loading files…</p>;
  if (!files.length) return <p className={styles.role}>No files shared in this channel yet.</p>;

  return (
    <>
      {files.map(file => (
        <a key={file.id} href={file.url ?? `/api/attachments/${file.id}`} download className={styles.fileCard}>
          <FileText size={18} />
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{file.fileName}</span>
            <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
          </div>
          <Download size={15} style={{ marginLeft: "auto" }} />
        </a>
      ))}
    </>
  );
}

function SearchDrawer({
  workspaceId,
  onJumpToMessage,
}: {
  workspaceId: string;
  onJumpToMessage: (channelId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { results: hits } = await request<{ results: WorkspaceSearchResult[] }>(
        `/api/workspaces/${workspaceId}/docs/search?query=${encodeURIComponent(query)}`
      );
      setResults(hits.filter((r): r is MessageSearchResult => r.type === "message"));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
        <Input
          placeholder="Search channel messages…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <Button variant="primary" disabled={loading || !query.trim()}>
          <Search size={14} />
        </Button>
      </form>

      {loading && <p className={styles.role}>Searching…</p>}
      {!loading && results.map(item => (
        <div
          key={item.id}
          className={styles.pinCard}
          onClick={() => {
            if (item.channelId) onJumpToMessage(item.channelId);
          }}
        >
          <strong>{item.title}</strong>
          <p style={{ margin: "4px 0", color: "var(--text)" }}>{item.snippet}</p>
          <small style={{ color: "var(--faint)" }}>{formatClockTime(item.createdAt)}</small>
        </div>
      ))}
      {!loading && !results.length && query && (
        <p className={styles.role}>No matching messages found.</p>
      )}
    </div>
  );
}

function Feed({
  channel,
  parentId,
  workspaceMembers,
  onThread,
  onUserPresenceChange,
}: {
  channel: ChannelSummary;
  parentId: string | null;
  workspaceMembers: Member[];
  onThread?: (message: ChatMessage) => void;
  onUserPresenceChange?: (updater: (prev: Set<string>) => Set<string>) => void;
}) {
  const handlePresenceUpdate = useCallback(
    (event: { userId: string; online: boolean }) => {
      if (!onUserPresenceChange) return;
      onUserPresenceChange(prev => {
        const next = new Set(prev);
        if (event.online) next.add(event.userId);
        else next.delete(event.userId);
        return next;
      });
    },
    [onUserPresenceChange]
  );

  const feed = useMessages(channel.id, parentId, {
    onPresenceUpdate: onUserPresenceChange ? handlePresenceUpdate : undefined,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [previousScrollHeight, setPreviousScrollHeight] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const isNearBottomRef = useRef(true);

  // Infinite scroll up preserving position
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceToBottom < 60;
    setShowJumpToBottom(distanceToBottom > 160);

    // If near top, load older messages
    if (el.scrollTop < 60 && feed.nextCursor && !feed.loadingOlder) {
      setPreviousScrollHeight(el.scrollHeight);
      void feed.loadOlder();
    }
  };

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (el && previousScrollHeight !== null) {
      const addedHeight = el.scrollHeight - previousScrollHeight;
      el.scrollTop += addedHeight;
      setPreviousScrollHeight(null);
    }
  }, [feed.messages, previousScrollHeight]);

  // Auto-scroll on new message if near bottom
  const lastMessageId = feed.messages.at(-1)?.id;
  useEffect(() => {
    if (isNearBottomRef.current) {
      endRef.current?.scrollIntoView({ block: "nearest" });
      setShowJumpToBottom(false);
    }
  }, [lastMessageId]);

  function scrollToBottom() {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setShowJumpToBottom(false);
  }

  // Find unique tickets mentioned across messages for channel header chips
  const linkedTickets = useMemo(() => {
    if (parentId) return [];
    const set = new Set<string>();
    const re = /\b([A-Z][A-Z0-9]{1,9}-[1-9]\d*)\b/g;
    for (const msg of feed.messages) {
      const text = extractPlainText(msg.body);
      const matches = text.match(re);
      if (matches) {
        for (const m of matches) set.add(m);
      }
    }
    return [...set].slice(0, 5);
  }, [feed.messages, parentId]);

  // Up arrow in empty composer triggers editing last message
  const handleEditLastMessage = useCallback(() => {
    const myMessages = feed.messages.filter(m => !m.deletedAt);
    const last = myMessages.at(-1);
    if (last) setEditingMessageId(last.id);
  }, [feed.messages]);

  // Compute date dividers and grouping
  const renderedItems = useMemo(() => {
    const items: React.ReactNode[] = [];
    let lastDate = "";
    let lastAuthorId = "";
    let lastTime = 0;
    const seenIds = new Set<string>();

    feed.messages.forEach(msg => {
      if (seenIds.has(msg.id)) return;
      seenIds.add(msg.id);
      const msgDate = new Date(msg.createdAt).toDateString();
      const msgTime = new Date(msg.createdAt).getTime();

      // Date divider
      if (msgDate !== lastDate) {
        items.push(
          <div key={`date-${msgDate}`} className={styles.dateDivider}>
            <span className={styles.dateDividerBadge}>{formatDateDivider(msg.createdAt)}</span>
          </div>
        );
        lastDate = msgDate;
        lastAuthorId = ""; // Reset grouping after date divider
      }

      // Group consecutive messages by same author within 5 minutes
      const authorId = msg.authorId ?? msg.sender.id;
      const isGrouped = authorId === lastAuthorId && msgTime - lastTime < 5 * 60 * 1000;

      items.push(
        <MessageCard
          key={msg.id}
          message={msg}
          workspaceId={channel.workspaceId}
          isGrouped={isGrouped}
          isEditing={editingMessageId === msg.id}
          onStartEdit={() => setEditingMessageId(msg.id)}
          onCancelEdit={() => setEditingMessageId(null)}
          onSaveEdit={async newBody => {
            await feed.edit(msg.id, newBody);
            setEditingMessageId(null);
          }}
          onDelete={() => feed.remove(msg.id)}
          onReact={emoji => feed.react(msg.id, emoji)}
          onPin={() => feed.pin(msg.id)}
          onThread={onThread}
        />
      );

      lastAuthorId = authorId;
      lastTime = msgTime;
    });

    return items;
  }, [channel.workspaceId, editingMessageId, feed, onThread]);

  return (
    <>
      <div className={styles.connection} role="status">
        <i data-live={feed.connected} />
        {feed.connected ? "Live" : "Reconnecting…"}
      </div>

      {feed.error && (
        <p role="alert" className={styles.error}>
          <span>{feed.error}</span>
          {!feed.denied && <button onClick={feed.refresh}>Retry history</button>}
        </p>
      )}

      {linkedTickets.length > 0 && (
        <div style={{ display: "flex", gap: "6px", padding: "6px 20px", background: "var(--sunken)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: "var(--t-xs)", color: "var(--faint)", alignSelf: "center", fontWeight: 600 }}>TICKETS:</span>
          {linkedTickets.map(key => (
            <Link
              key={key}
              href={`/tickets/${encodeURIComponent(key)}?workspaceId=${encodeURIComponent(channel.workspaceId)}`}
              className={styles.ticketLink}
            >
              {key}
            </Link>
          ))}
        </div>
      )}

      <div className={styles.messagesScrollWrapper}>
        <div
          ref={scrollContainerRef}
          className={styles.messages}
          role="log"
          aria-label={parentId ? "Thread replies" : "Channel messages"}
          aria-live="polite"
          aria-busy={feed.loading}
          onScroll={handleScroll}
        >
          {feed.loading && <p className={styles.role}>Loading messages…</p>}

          {feed.nextCursor && (
            <button
              disabled={feed.loadingOlder}
              className={styles.loadOlder}
              onClick={feed.loadOlder}
            >
              {feed.loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          )}

          {!feed.loading && !feed.messages.length && !feed.denied && (
            <div className={styles.empty}>
              <MessageCircle size={28} />
              <h3>{parentId ? "Keep the discussion going" : `Welcome to #${channel.name ?? "this chat"}`}</h3>
              <p>{parentId ? "Write the first reply." : "Start a conversation with your team."}</p>
            </div>
          )}

          {renderedItems}
          <div ref={endRef} />
        </div>

        {showJumpToBottom && (
          <button className={styles.jumpToBottom} onClick={scrollToBottom}>
            <ArrowDown size={14} />
            <span>New messages</span>
          </button>
        )}
      </div>

      {!parentId && <p className={styles.typing} role="status" aria-live="polite">{feed.typing}</p>}

      <RichComposer
        channelId={channel.id}
        workspaceId={channel.workspaceId}
        parentId={parentId}
        disabled={feed.denied || feed.loading}
        workspaceMembers={workspaceMembers}
        onSent={feed.append}
        onUpdateStatus={feed.updateMessageStatus}
        onTyping={feed.notifyTyping}
        onEditLastMessage={handleEditLastMessage}
      />
    </>
  );
}

function MessageCard({
  message,
  workspaceId,
  isGrouped,
  isEditing = false,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onReact,
  onPin,
  onThread,
}: {
  message: ChatMessage;
  workspaceId: string;
  isGrouped: boolean;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (body: string) => Promise<void>;
  onDelete?: () => void;
  onReact: (emoji: string) => void;
  onPin: () => void;
  onThread?: (message: ChatMessage) => void;
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const plainBody = extractPlainText(message.body);
  const [editDraft, setEditDraft] = useState(plainBody);
  const [busyEdit, setBusyEdit] = useState(false);

  function handleStartEdit() {
    setEditDraft(extractPlainText(message.body));
    onStartEdit?.();
  }

  const ticketKeys = [...new Set(plainBody.match(/\b([A-Z][A-Z0-9]{1,9}-[1-9]\d*)\b/g) ?? [])];
  const isDeleted = !!message.deletedAt;
  const isEdited = !!message.editedAt && !isDeleted;

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editDraft.trim() || busyEdit) return;
    setBusyEdit(true);
    try {
      await onSaveEdit?.(editDraft.trim());
    } finally {
      setBusyEdit(false);
    }
  }

  return (
    <article
      className={`${styles.messageCard} ${isGrouped ? styles.grouped : ""} ${
        message.status === "sending" ? styles.sending : message.status === "failed" ? styles.failed : ""
      }`}
      data-message-id={message.id}
    >
      {/* HOVER ACTION TOOLBAR */}
      {!isDeleted && !isEditing && (
        <div className={styles.actionToolbar}>
          <button
            className={styles.actionBtn}
            title="React"
            aria-label="Add reaction"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile size={14} />
          </button>

          {onThread && (
            <button
              className={styles.actionBtn}
              title="Reply in thread"
              aria-label="Reply in thread"
              onClick={() => onThread(message)}
            >
              <MessageCircle size={14} />
            </button>
          )}

          <button
            className={styles.actionBtn}
            title={message.isPinned ? "Unpin message" : "Pin message"}
            aria-label="Pin message"
            onClick={onPin}
          >
            <Pin size={14} />
          </button>

          {onStartEdit && (
            <button
              className={styles.actionBtn}
              title="Edit message"
              aria-label="Edit message"
              onClick={handleStartEdit}
            >
              <Edit2 size={14} />
            </button>
          )}

          {onDelete && (
            <button
              className={styles.actionBtn}
              title="Delete message"
              aria-label="Delete message"
              onClick={() => {
                if (confirm("Are you sure you want to delete this message?")) onDelete();
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      {/* QUICK EMOJI PICKER POPOVER */}
      {showEmojiPicker && (
        <div className={styles.emojiPickerPopover}>
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              className={styles.emojiQuickBtn}
              onClick={() => {
                onReact(emoji);
                setShowEmojiPicker(false);
              }}
            >
              {emoji}
            </button>
          ))}
          <button
            className={styles.iconBtn}
            onClick={() => setShowEmojiPicker(false)}
            style={{ width: "20px", height: "20px" }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className={styles.avatarCol}>
        {!isGrouped ? (
          <Avatar small initials={initials(message.sender.name)} />
        ) : (
          <span className={styles.compactTime}>{formatClockTime(message.createdAt)}</span>
        )}
      </div>

      <div className={styles.bodyCol}>
        {message.isPinned && (
          <div className={styles.pinnedChip}>
            <Pin size={11} /> <span>Pinned</span>
          </div>
        )}

        {!isGrouped && (
          <div className={styles.metaRow}>
            <strong className={styles.authorName}>{message.sender.name ?? "Member"}</strong>
            <time
              className={styles.timestamp}
              dateTime={message.createdAt}
              title={new Date(message.createdAt).toLocaleString()}
            >
              {formatClockTime(message.createdAt)}
            </time>
            {isEdited && <span className={styles.editedBadge}>(edited)</span>}
          </div>
        )}

        {isEditing ? (
          <form onSubmit={handleEditSubmit} className={styles.inlineEditBox}>
            <textarea
              className={styles.inlineEditTextarea}
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              autoFocus
              rows={2}
            />
            <div className={styles.inlineEditActions}>
              <Button disabled={busyEdit} variant="primary">
                Save
              </Button>
              <Button type="button" variant="quiet" onClick={onCancelEdit}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className={`${styles.messageText} ${isDeleted ? styles.deleted : ""}`}>
            {isDeleted ? (
              "This message was deleted"
            ) : (
              <TiptapRenderer content={message.body} workspaceId={workspaceId} />
            )}
          </div>
        )}

        {/* Embedded Ticket Cards */}
        {!isDeleted && !isEditing && ticketKeys.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {ticketKeys.map(key => (
              <Link
                key={key}
                className={styles.ticketCard}
                href={`/tickets/${encodeURIComponent(key)}?workspaceId=${encodeURIComponent(workspaceId)}`}
              >
                <Ticket size={13} />
                <span className={styles.ticketCardKey}>{key}</span>
                <span>· Ticket</span>
              </Link>
            ))}
          </div>
        )}

        {/* Attachments */}
        {!isDeleted && message.attachments && message.attachments.length > 0 && (
          <div className={styles.messageAttachments}>
            {message.attachments.map(att => {
              const isImage = att.mimeType.startsWith("image/");
              const url = att.url ?? `/api/attachments/${att.id}`;

              if (isImage) {
                return (
                  <div key={att.id} className={styles.imagePreviewWrapper}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={att.fileName} className={styles.imagePreview} />
                    </a>
                  </div>
                );
              }

              return (
                <a key={att.id} href={url} download={att.fileName} className={styles.fileCard}>
                  <FileText size={18} />
                  <div className={styles.fileInfo}>
                    <span className={styles.fileName}>{att.fileName}</span>
                    <span className={styles.fileSize}>{formatFileSize(att.size)}</span>
                  </div>
                  <Download size={14} style={{ marginLeft: "auto" }} />
                </a>
              );
            })}
          </div>
        )}

        {/* Reactions Chips */}
        {!isDeleted && message.reactions && message.reactions.length > 0 && (
          <div className={styles.reactionsRow}>
            {message.reactions.map((r: ChatReaction) => {
              const hasReacted = r.userIds?.includes("me");
              return (
                <button
                  key={r.emoji}
                  className={`${styles.reactionChip} ${hasReacted ? styles.active : ""}`}
                  onClick={() => onReact(r.emoji)}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.cardFooter}>
          {message.status === "sending" && <small style={{ color: "var(--faint)" }}>Sending…</small>}
          {message.status === "failed" && (
            <small style={{ color: "var(--high)", fontWeight: 600 }}>Failed to send</small>
          )}

          {onThread && !isDeleted && (
            <button className={styles.replyBtn} onClick={() => onThread(message)}>
              <MessageCircle size={13} />
              <span>
                {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"} · Reply
              </span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
