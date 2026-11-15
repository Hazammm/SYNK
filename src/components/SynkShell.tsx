"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Bell, Check, ChevronsUpDown, Clock3, FileText, Hash, LayoutDashboard, Menu, MessageCircle, Moon,
  PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, KanbanSquare, Sun, Users, X,
} from "lucide-react";
import { applyTheme, useTheme } from "@/lib/theme";
import { NOTIFICATIONS_CHANGED } from "@/lib/events";
import AgentPanel from "@/features/agent/AgentPanel";
import Logo, { LogoMark } from "./Logo";
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

// Signed-out pages show the toggle in the top corner.
export function ThemeBar() {
  return <div className={styles.themeCorner}><ThemeToggle /></div>;
}

// The collapsed sidebar is remembered in this browser.
const COLLAPSE_KEY = "synk-sidebar-collapsed";
const COLLAPSE_EVENT = "synk-sidebar-change";
function useCollapsed() {
  const collapsed = useSyncExternalStore(
    notify => { window.addEventListener(COLLAPSE_EVENT, notify); return () => window.removeEventListener(COLLAPSE_EVENT, notify); },
    () => window.localStorage.getItem(COLLAPSE_KEY) === "1",
    () => false,
  );
  const toggle = () => { window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1"); window.dispatchEvent(new Event(COLLAPSE_EVENT)); };
  return [collapsed, toggle] as const;
}

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
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const base = workspaceId ? `/w/${workspaceId}` : "";
  const search = useRef<HTMLInputElement>(null);
  const switcher = useRef<HTMLDivElement>(null);
  const displayName = workspaceName || "Workspace";
  const displayGlyph = displayName[0]?.toUpperCase() || "W";

  // Ctrl+K or ⌘K jumps to the search box from anywhere.
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && search.current) { event.preventDefault(); search.current.focus(); }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!switcherOpen) return;
    const outside = (event: MouseEvent) => { if (!switcher.current?.contains(event.target as Node)) setSwitcherOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setSwitcherOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [switcherOpen]);

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

  const nav = [
    { label: "Overview", href: `${base}/overview`, icon: LayoutDashboard, active: pathname.endsWith("/overview") },
    { label: "Chat", href: `${base}/chat`, icon: MessageCircle, active: pathname.endsWith("/chat") },
    { label: "Board", href: `${base}/board`, icon: KanbanSquare, active: pathname.includes("/board") || pathname.includes("/tickets/") },
    { label: "Docs", href: `${base}/docs`, icon: FileText, active: pathname.endsWith("/docs") },
    { label: "Time", href: `${base}/time`, icon: Clock3, active: pathname.endsWith("/time") },
  ];
  const alertsActive = pathname.endsWith("/alerts");
  const flush = pathname.endsWith("/chat") || pathname.endsWith("/docs");
  const unreadLabel = unread > 99 ? "99+" : String(unread);

  return (
    <div className={styles.app} data-collapsed={collapsed} data-drawer={drawerOpen}>
      <a href="#synk-main" className={styles.skipLink}>Skip to content</a>
      <button type="button" className={styles.scrim} aria-label="Close menu" tabIndex={drawerOpen ? 0 : -1} onClick={() => setDrawerOpen(false)} />

      {/* Following any link in the sidebar closes the mobile drawer and the workspace menu. */}
      <aside className={styles.sidebar} aria-label="Workspace" onClick={event => { if ((event.target as HTMLElement).closest("a")) { setDrawerOpen(false); setSwitcherOpen(false); } }}>
        <div className={styles.sidebarHead}>
          <Link href={`${base}/overview`} className={styles.brand} aria-label="Synk home">
            <span className={styles.brandFull}><Logo size={22} /></span>
            <span className={styles.brandMarkOnly}><LogoMark size={24} /></span>
          </Link>
          <button type="button" className={`${styles.iconButton} ${styles.collapseButton}`} onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
          <button type="button" className={`${styles.iconButton} ${styles.drawerClose}`} onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className={styles.switcherWrap} ref={switcher}>
          <button className={styles.switcher} type="button" aria-haspopup="menu" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen(!switcherOpen)} title={displayName}>
            <span className={styles.glyph}>{displayGlyph}</span>
            <span className={styles.switcherText}><strong>{displayName}</strong><small>{role === "ADMIN" ? "Admin" : "Member"}</small></span>
            <ChevronsUpDown size={14} aria-hidden="true" />
          </button>
          {switcherOpen && (
            <div className={styles.menu} role="menu" aria-label="Switch workspace">
              <span className={styles.menuLabel}>Workspaces</span>
              {workspaces.map(ws => (
                <Link key={ws.id} role="menuitem" href={`/w/${ws.id}/overview`} className={styles.menuItem} aria-current={ws.id === workspaceId ? "true" : undefined} onClick={() => setSwitcherOpen(false)}>
                  <span className={styles.glyph}>{ws.name[0]?.toUpperCase() || "W"}</span>
                  <span>{ws.name}</span>
                  {ws.id === workspaceId && <Check size={15} aria-hidden="true" />}
                </Link>
              ))}
              {!workspaces.length && <span className={styles.menuEmpty}>No workspaces yet</span>}
              <div className={styles.menuDivider} />
              <Link href="/create-workspace" role="menuitem" className={styles.menuItem} onClick={() => setSwitcherOpen(false)}>
                <span className={styles.menuIcon}><Plus size={15} aria-hidden="true" /></span><span>New workspace</span>
              </Link>
            </div>
          )}
        </div>

        <nav className={styles.nav} aria-label="Workspace navigation">
          {nav.map(({ label, href, icon: Icon, active }) => (
            <Link key={href} href={href} className={styles.navLink} aria-current={active ? "page" : undefined} title={label}>
              <Icon size={17} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
          <Link href={`${base}/alerts`} className={styles.navLink} aria-current={alertsActive ? "page" : undefined} title="Alerts">
            <Bell size={17} aria-hidden="true" /><span>Alerts</span>
            {unread > 0 && <em className={styles.navCount} aria-hidden="true">{unreadLabel}</em>}
          </Link>
        </nav>

        <div className={styles.sectionLabel}><span>Conversations</span><Link href={`${base}/chat?newChannel=1`} aria-label="Create channel" title="Create channel"><Plus size={15} aria-hidden="true" /></Link></div>
        <nav className={styles.nav} aria-label="Conversations">
          <Link href={`${base}/chat`} className={styles.navLink} title="general"><Hash size={17} aria-hidden="true" /><span>general</span></Link>
          <Link href={`${base}/settings?section=Members`} className={styles.navLink} title="Workspace members"><Users size={17} aria-hidden="true" /><span>Workspace members</span></Link>
        </nav>

        <div className={styles.sidebarFoot}>
          <Link href={`${base}/settings`} className={styles.navLink} aria-current={pathname.endsWith("/settings") ? "page" : undefined} title="Settings"><Settings size={17} aria-hidden="true" /><span>Settings</span></Link>
          <ThemeToggle className={styles.showSmall} />
          <span className={styles.version}>v1.0.0</span>
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
                <input ref={search} type="search" name="q" required minLength={2} maxLength={200} aria-label="Search Synk" placeholder="Search tickets, pages and messages" />
                <kbd>Ctrl K</kbd>
              </form>
            : <span className={styles.searchSpacer} />}
          <div className={styles.topbarActions}>
            <AgentPanel />
            <ThemeToggle className={styles.hideSmall} />
            <Link href={`${base}/alerts`} className={styles.iconButton} aria-label={`Alerts, ${unread} unread`} title="Alerts" aria-current={alertsActive ? "page" : undefined}>
              <Bell size={17} aria-hidden="true" />{unread > 0 && <span className={styles.alertCount}>{unreadLabel}</span>}
            </Link>
            <SettingsLink href={`${base}/settings`} className={`${styles.iconButton} ${styles.hideSmall}`} />
            <ProfileMenu userName={userName} settingsHref={`${base}/settings`} />
          </div>
        </header>
        <main id="synk-main" className={`${styles.main} ${flush ? styles.mainFlush : ""}`} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
