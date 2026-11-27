"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell, Check, Clock3, FileText, Hash, KanbanSquare, LayoutDashboard, Menu, MessageCircle, MessageSquarePlus,
  Moon, MoreHorizontal, Plus, Search, Settings, SquarePen, Sun, Ticket, Users, Webhook, X,
} from "lucide-react";
import { applyTheme, useTheme } from "@/lib/theme";
import { NOTIFICATIONS_CHANGED } from "@/lib/events";
import AgentPanel from "@/features/agent/AgentPanel";
import { useLiveAlerts } from "@/features/notifications/live";
import QuickSwitcher from "./QuickSwitcher";
import { LogoMark } from "./Logo";
import ProfileMenu, { SettingsLink } from "./ProfileMenu";
import styles from "./Synk.module.css";

// One button that flips between the light and dark themes.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className={`${styles.iconButton} ${className}`} onClick={() => applyTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}

type Popover = "workspace" | "more" | "create" | null;

// The app frame, laid out like Slack: a narrow rail of tabs on the left and a search bar across the top.
export default function SynkShell({
  children,
  userName,
  workspaceId,
  workspaceName,
  role,
  workspaces = [],
}: {
  children: React.ReactNode;
  userName: string;
  workspaceId?: string;
  workspaceName?: string;
  role?: "ADMIN" | "MEMBER";
  workspaces?: Array<{ id: string; name: string; role: "ADMIN" | "MEMBER" }>;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);
  const [unread, setUnread] = useState(0);
  const base = workspaceId ? `/w/${workspaceId}` : "";
  const [quickOpen, setQuickOpen] = useState(false);
  const displayName = workspaceName || "Workspace";
  const displayGlyph = displayName[0]?.toUpperCase() || "W";
  useLiveAlerts(Boolean(workspaceId));

  // Ctrl+K or ⌘K opens the quick switcher from anywhere in a workspace.
  useEffect(() => {
    if (!workspaceId) return;
    const openSwitcher = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setQuickOpen(open => !open); }
    };
    window.addEventListener("keydown", openSwitcher);
    return () => window.removeEventListener("keydown", openSwitcher);
  }, [workspaceId]);

  useEffect(() => {
    if (!popover) return;
    const outside = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest("[data-rail-popover]")) setPopover(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPopover(null); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [popover]);

  useEffect(() => {
    const load = () => {
      fetch("/api/notifications?summary=1", { cache: "no-store" })
        .then(response => {
          if (!response.ok) throw new Error(`Notification count request failed (${response.status}).`);
          return response.json();
        })
        .then(body => setUnread(body.unread))
        .catch(error => console.error("Unable to load notification count.", error));
    };
    load();
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, load);
  }, [pathname]);

  const unreadLabel = unread > 99 ? "99+" : String(unread);
  const alertsActive = pathname.endsWith("/alerts");
  const tabs = [
    { label: "Home", href: `${base}/chat`, icon: MessageCircle, active: pathname.includes("/chat") },
    { label: "Activity", href: `${base}/alerts`, icon: Bell, active: alertsActive, badge: unread },
    { label: "Board", href: `${base}/board`, icon: KanbanSquare, active: pathname.includes("/board") || pathname.includes("/tickets/") },
    { label: "Docs", href: `${base}/docs`, icon: FileText, active: pathname.endsWith("/docs") },
    { label: "Time", href: `${base}/time`, icon: Clock3, active: pathname.endsWith("/time") },
  ];
  const more = [
    { label: "Overview", href: `${base}/overview`, icon: LayoutDashboard, active: pathname.endsWith("/overview") },
    { label: "People", href: `${base}/people`, icon: Users, active: pathname.endsWith("/people") },
    { label: "Apps", href: `${base}/apps`, icon: Webhook, active: pathname.endsWith("/apps") },
    { label: "Settings", href: `${base}/settings`, icon: Settings, active: pathname.endsWith("/settings") },
  ];
  const create = [
    { label: "Message", hint: "Start a conversation", href: `${base}/people`, icon: MessageSquarePlus },
    { label: "Channel", hint: "Start a group conversation", href: `${base}/chat?newChannel=1`, icon: Hash },
    { label: "Ticket", hint: "Track a piece of work", href: `${base}/board`, icon: Ticket },
    { label: "Page", hint: "Write it down in Docs", href: `${base}/docs`, icon: SquarePen },
  ];
  const moreActive = more.some(item => item.active);
  const flush = pathname.endsWith("/chat") || pathname.includes("/chat/") || pathname.endsWith("/docs");
  const toggle = (name: Exclude<Popover, null>) => setPopover(current => (current === name ? null : name));

  return (
    <div className={styles.app} data-drawer={drawerOpen}>
      <a href="#synk-main" className={styles.skipLink}>Skip to content</a>
      <button type="button" className={styles.scrim} aria-label="Close menu" tabIndex={drawerOpen ? 0 : -1} onClick={() => setDrawerOpen(false)} />

      {/* Following any link in the rail closes the mobile drawer and any open menu. */}
      <aside className={styles.sidebar} aria-label="Workspace" onClick={event => { if ((event.target as HTMLElement).closest("a")) { setDrawerOpen(false); setPopover(null); } }}>
        <button type="button" className={`${styles.iconButton} ${styles.drawerClose}`} onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X size={18} aria-hidden="true" /></button>

        <div className={styles.railSlot} data-rail-popover>
          <button className={styles.workspaceTile} type="button" aria-haspopup="menu" aria-expanded={popover === "workspace"} onClick={() => toggle("workspace")} title={`${displayName} (${role === "ADMIN" ? "admin" : "member"})`}>
            {displayGlyph}
          </button>
          {popover === "workspace" && (
            <div className={styles.menu} role="menu" aria-label="Switch workspace">
              <div className={styles.menuHeader}><span className={styles.glyph}>{displayGlyph}</span><span><strong>{displayName}</strong><small>{role === "ADMIN" ? "Admin" : "Member"}</small></span></div>
              <div className={styles.menuDivider} />
              <span className={styles.menuLabel}>Workspaces</span>
              {workspaces.map(ws => (
                <Link key={ws.id} role="menuitem" href={`/w/${ws.id}/chat`} className={styles.menuItem} aria-current={ws.id === workspaceId ? "true" : undefined}>
                  <span className={styles.glyph}>{ws.name[0]?.toUpperCase() || "W"}</span>
                  <span>{ws.name}</span>
                  {ws.id === workspaceId && <Check size={15} aria-hidden="true" />}
                </Link>
              ))}
              {!workspaces.length && <span className={styles.menuEmpty}>No workspaces yet</span>}
              <div className={styles.menuDivider} />
              <Link href="/create-workspace" role="menuitem" className={styles.menuItem}>
                <span className={styles.menuIcon}><Plus size={15} aria-hidden="true" /></span><span>New workspace</span>
              </Link>
            </div>
          )}
        </div>

        <nav className={styles.nav} aria-label="Workspace navigation">
          {tabs.map(({ label, href, icon: Icon, active, badge }) => (
            <Link key={href} href={href} className={styles.railTab} aria-current={active ? "page" : undefined} title={label}>
              <span className={styles.railIcon}><Icon size={19} aria-hidden="true" />{badge ? <em className={styles.navCount} aria-label={`${unreadLabel} unread`}>{unreadLabel}</em> : null}</span>
              <span className={styles.railLabel}>{label}</span>
            </Link>
          ))}
          <div className={styles.railSlot} data-rail-popover>
            <button type="button" className={styles.railTab} aria-haspopup="menu" aria-expanded={popover === "more"} data-active={moreActive || undefined} onClick={() => toggle("more")} title="More">
              <span className={styles.railIcon}><MoreHorizontal size={19} aria-hidden="true" /></span>
              <span className={styles.railLabel}>More</span>
            </button>
            {popover === "more" && (
              <div className={styles.menu} role="menu" aria-label="More">
                <span className={styles.menuLabel}>More</span>
                {more.map(({ label, href, icon: Icon, active }) => (
                  <Link key={href} role="menuitem" href={href} className={styles.menuItem} aria-current={active ? "true" : undefined}>
                    <span className={styles.menuIcon}><Icon size={15} aria-hidden="true" /></span><span>{label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className={styles.railFoot}>
          <div className={styles.railSlot} data-rail-popover>
            <button type="button" className={styles.createButton} aria-haspopup="menu" aria-expanded={popover === "create"} onClick={() => toggle("create")} aria-label="Create new" title="Create new">
              <Plus size={20} aria-hidden="true" />
            </button>
            {popover === "create" && (
              <div className={`${styles.menu} ${styles.menuUp}`} role="menu" aria-label="Create">
                <span className={styles.menuLabel}>Create</span>
                {create.map(({ label, hint, href, icon: Icon }) => (
                  <Link key={label} role="menuitem" href={href} className={styles.menuItem}>
                    <span className={styles.menuIcon}><Icon size={15} aria-hidden="true" /></span>
                    <span><strong>{label}</strong><small>{hint}</small></span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <ThemeToggle className={`${styles.railTheme} ${styles.showSmall}`} />
          <ProfileMenu compact userName={userName} settingsHref={`${base}/settings`} />
        </div>
      </aside>

      <div className={styles.body}>
        <header className={styles.topbar}>
          <button className={`${styles.iconButton} ${styles.menuButton}`} onClick={() => setDrawerOpen(true)} type="button" aria-label="Open menu" aria-expanded={drawerOpen}>
            <Menu size={18} aria-hidden="true" />
          </button>
          <Link href={`${base}/overview`} className={styles.topbarBrand} aria-label="Synk home"><LogoMark size={22} /></Link>
          {workspaceId
            ? <form role="search" action={`${base}/search`} className={styles.search}>
                <Search size={15} aria-hidden="true" />
                <input type="search" name="q" required minLength={2} maxLength={200} aria-label="Search Synk" placeholder={`Search ${displayName}`} />
                <button type="button" className={styles.kbdButton} onClick={() => setQuickOpen(true)} aria-label="Open the quick switcher" title="Jump to a page, channel or person"><kbd>Ctrl K</kbd></button>
              </form>
            : <span className={styles.searchSpacer} />}
          <div className={styles.topbarActions}>
            <AgentPanel launcherClassName={styles.navLauncher} />
            <ThemeToggle className={styles.hideSmall} />
            <SettingsLink href={`${base}/settings`} className={`${styles.iconButton} ${styles.hideSmall}`} />
          </div>
        </header>
        {quickOpen && workspaceId && <QuickSwitcher workspaceId={workspaceId} onClose={() => setQuickOpen(false)} />}
        <main id="synk-main" className={`${styles.main} ${flush ? styles.mainFlush : ""}`} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
