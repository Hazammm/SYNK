"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  Bell, BookOpen, ChevronDown, Clock3, FileText, LayoutDashboard, MessageCircle,
  Search, Settings, KanbanSquare,
} from "lucide-react";
import { applyTheme, type ThemeName, useTheme } from "@/lib/theme";
import { Avatar } from "./Primitives";
import styles from "./Synk.module.css";

const themes: { id: ThemeName; label: string }[] = [
  { id: "black", label: "Black" },
  { id: "white", label: "White" },
  { id: "forest", label: "Forest" },
  { id: "lavender", label: "Lavender" },
];

export function ThemeBar() {
  const theme = useTheme();

  return (
    <div className={styles.themeBar} aria-label="Theme selection">
      <span className={styles.themeLabel}>Theme</span>
      {themes.map((item) => (
        <button
          aria-label={`${item.label} theme`}
          aria-pressed={theme === item.id}
          className={`${styles.themeDot} ${theme === item.id ? styles.themeSelected : ""}`}
          key={item.id}
          onClick={() => applyTheme(item.id)}
          title={item.label}
          type="button"
          data-swatch={item.id}
        />
      ))}
      <span className={styles.themeName}>{theme}</span>
    </div>
  );
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
  const [mobilePanel, setMobilePanel] = useState(false);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const base = workspaceId ? `/w/${workspaceId}` : "";
  const displayName = workspaceName || "Workspace";
  const displayGlyph = displayName[0]?.toUpperCase() || "W";

  const appTabs = [
    { label: "Overview", href: `${base}/overview`, icon: LayoutDashboard },
    { label: "Chat", href: `${base}/chat`, icon: MessageCircle },
    { label: "Board", href: `${base}/board`, icon: KanbanSquare },
    { label: "Docs", href: `${base}/docs`, icon: FileText },
    { label: "Time", href: `${base}/time`, icon: Clock3 },
  ];

  const isChatOrTicket = pathname.endsWith("/chat") || pathname.includes("/tickets/");

  if (isChatOrTicket) return <div className={styles.app}>
    <header className={styles.topbar}>
      <Link href={`${base}/chat`} className={styles.brand} aria-label="Synk home"><span className={styles.brandMark}>s</span> synk</Link>
      <nav className={styles.topTabs} aria-label="Workspace navigation">
        <Link href={`${base}/chat`} className={`${styles.topTab} ${pathname.endsWith("/chat") ? styles.topTabActive : ""}`}>Chat</Link>
        <Link href={`${base}/overview`} className={styles.topTab}>Overview</Link>
      </nav>
      <span className={styles.liveUser}>{userName}</span>
      <button className={styles.signOut} onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>
    </header>
    <main>{children}</main><div className={styles.liveTheme}><ThemeBar /></div>
  </div>;

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <Link href={`${base}/overview`} className={styles.brand} aria-label="Synk home">
          <span className={styles.brandMark}>s</span> synk
        </Link>
        <div className={styles.projectSelectWrap}>
          <button className={styles.projectSelect} type="button" onClick={() => setWsDropdownOpen(!wsDropdownOpen)}>
            <span className={styles.projectGlyph}>{displayGlyph}</span>
            <span>{displayName}</span>
            <ChevronDown size={15} />
          </button>
          {wsDropdownOpen && (
            <div className={styles.workspaceMenu}>
              {workspaces.map(ws => (
                <Link
                  key={ws.id}
                  href={`/w/${ws.id}/overview`}
                  className={`${styles.workspaceMenuItem} ${ws.id === workspaceId ? styles.workspaceMenuActive : ""}`}
                  onClick={() => setWsDropdownOpen(false)}
                >
                  <span>{ws.name}</span>
                  {ws.id === workspaceId && <small>Current</small>}
                </Link>
              ))}
              <div className={styles.workspaceMenuDivider} />
              <Link
                href="/create-workspace"
                className={styles.workspaceMenuItem}
                onClick={() => setWsDropdownOpen(false)}
              >
                + New workspace
              </Link>
              <button
                type="button"
                className={styles.workspaceMenuItem}
                onClick={() => void signOut({ callbackUrl: "/login" })}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
        <nav className={styles.topTabs} aria-label="Project navigation">
          {appTabs.map((tab) => {
            const active = pathname === tab.href || (tab.href.endsWith("/board") && pathname.includes("/board"));
            return (
              <Link className={`${styles.topTab} ${active ? styles.topTabActive : ""}`} href={tab.href} key={tab.href}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <label className={styles.search}>
          <Search size={15} />
          <input aria-label="Search Synk" placeholder="Search anything..." />
          <kbd>⌘ K</kbd>
        </label>
        <Link href={`${base}/alerts`} className={styles.alertButton} aria-label="Alerts">
          <Bell size={18} />
        </Link>
        <Link className={styles.profileLink} href={`${base}/settings`} aria-label="Open settings">
          <Avatar initials={userName.slice(0, 2).toUpperCase()} />
        </Link>
        <button className={styles.mobileToggle} onClick={() => setMobilePanel(!mobilePanel)} type="button" aria-label="Toggle project menu">
          <ChevronDown size={18} />
        </button>
      </header>
      <div className={styles.workspace}>
        <aside className={`${styles.projectPanel} ${mobilePanel ? styles.projectPanelOpen : ""}`}>
          <div className={styles.projectIdentity}>
            <span className={styles.projectGlyphLarge}>{displayGlyph}</span>
            <div><strong>{displayName}</strong><span>{role === "ADMIN" ? "Admin" : "Member"}</span></div>
            <ChevronDown size={15} />
          </div>
          <div className={styles.sidebarLabel}>WORKSPACE</div>
          <Link href={`${base}/overview`} className={`${styles.sideLink} ${pathname.endsWith("/overview") ? styles.sideActive : ""}`}><LayoutDashboard size={17} /> Overview</Link>
          <Link href={`${base}/board`} className={`${styles.sideLink} ${pathname.includes("/board") ? styles.sideActive : ""}`}><KanbanSquare size={17} /> Board</Link>
          <Link href={`${base}/docs`} className={`${styles.sideLink} ${pathname.endsWith("/docs") ? styles.sideActive : ""}`}><BookOpen size={17} /> Docs</Link>
          <Link href={`${base}/time`} className={`${styles.sideLink} ${pathname.endsWith("/time") ? styles.sideActive : ""}`}><Clock3 size={17} /> Time</Link>
          <div className={styles.sidebarLabel}>CONVERSATIONS <button type="button" aria-label="Add conversation">+</button></div>
          <Link href={`${base}/chat`} className={`${styles.sideLink} ${pathname.endsWith("/chat") ? styles.sideActive : ""}`}><MessageCircle size={17} /> # general</Link>
          <Link href={`${base}/settings?section=Members`} className={styles.sideLink}>Workspace members</Link>
          <div className={styles.sideFooter}><Link href={`${base}/settings`}><Settings size={17} /> Settings</Link><span>v1.0.0</span></div>
        </aside>
        <main className={styles.main}>{children}</main>
        <aside className={styles.contextPanel}>
          <div className={styles.contextHeading}>Workspace members</div>
          <Link className={styles.contextDoc} href={`${base}/settings?section=Members`}>Manage members</Link>
          <div className={styles.contextRule} />
          <div className={styles.contextHeading}>Documents</div>
          <span className={styles.contextDoc}>No documents yet</span>
        </aside>
      </div>
      <ThemeBar />
    </div>
  );
}
