"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  Bell, BookOpen, ChevronDown, Clock3, FileText, LayoutDashboard, MessageCircle,
  Search, Settings, KanbanSquare,
} from "lucide-react";
import type { ThemeName } from "@/mocks/data";
import { applyTheme, useTheme } from "@/lib/theme";
import { Avatar } from "./Primitives";
import styles from "./Synk.module.css";

const themes: { id: ThemeName; label: string }[] = [
  { id: "black", label: "Black" },
  { id: "white", label: "White" },
  { id: "forest", label: "Forest" },
  { id: "lavender", label: "Lavender" },
];

const tabs = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Chat", href: "/chat", icon: MessageCircle },
  { label: "Board", href: "/board", icon: KanbanSquare },
  { label: "Docs", href: "/docs", icon: FileText },
  { label: "Time", href: "/time", icon: Clock3 },
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

export default function SynkShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const [mobilePanel, setMobilePanel] = useState(false);

  if (pathname === "/chat" || pathname.startsWith("/tickets/")) return <div className={styles.app}>
    <header className={styles.topbar}>
      <Link href="/chat" className={styles.brand} aria-label="Synk home"><span className={styles.brandMark}>s</span> synk</Link>
      <nav className={styles.topTabs} aria-label="Workspace navigation"><Link href="/chat" className={`${styles.topTab} ${styles.topTabActive}`}>Chat</Link><Link href="/overview" className={styles.topTab}>Product preview</Link></nav>
      <span className={styles.liveUser}>{userName}</span><button className={styles.signOut} onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>
    </header>
    <main>{children}</main><div className={styles.liveTheme}><ThemeBar /></div>
  </div>;

  return (
    <div className={styles.app}>
      <div className={styles.previewNotice}>Product preview with sample data. <Link href="/chat">Open live workspace chat →</Link></div>
      <header className={styles.topbar}>
        <Link href="/overview" className={styles.brand} aria-label="Synk home">
          <span className={styles.brandMark}>s</span> synk
        </Link>
        <button className={styles.projectSelect} type="button">
          <span className={styles.projectGlyph}>F</span>
          <span>FYP Synk</span>
          <ChevronDown size={15} />
        </button>
        <nav className={styles.topTabs} aria-label="Project navigation">
          {tabs.map((tab) => {
            const active = pathname === tab.href || (tab.href === "/board" && pathname.startsWith("/board"));
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
        <Link href="/alerts" className={styles.alertButton} aria-label="Alerts, 2 unread">
          <Bell size={18} /><span className={styles.alertCount}>2</span>
        </Link>
        <Link className={styles.profileLink} href="/settings" aria-label="Open settings">
          <Avatar initials="AR" />
        </Link>
        <button className={styles.mobileToggle} onClick={() => setMobilePanel(!mobilePanel)} type="button" aria-label="Toggle project menu">
          <ChevronDown size={18} />
        </button>
      </header>
      <div className={styles.workspace}>
        <aside className={`${styles.projectPanel} ${mobilePanel ? styles.projectPanelOpen : ""}`}>
          <div className={styles.projectIdentity}>
            <span className={styles.projectGlyphLarge}>F</span>
            <div><strong>FYP Synk</strong><span>Design team</span></div>
            <ChevronDown size={15} />
          </div>
          <div className={styles.sidebarLabel}>WORKSPACE</div>
          <Link href="/overview" className={`${styles.sideLink} ${pathname === "/overview" ? styles.sideActive : ""}`}><LayoutDashboard size={17} /> Overview</Link>
          <Link href="/board" className={`${styles.sideLink} ${pathname.startsWith("/board") ? styles.sideActive : ""}`}><KanbanSquare size={17} /> Board <span className={styles.sideCount}>12</span></Link>
          <Link href="/docs" className={`${styles.sideLink} ${pathname === "/docs" ? styles.sideActive : ""}`}><BookOpen size={17} /> Docs</Link>
          <Link href="/time" className={`${styles.sideLink} ${pathname === "/time" ? styles.sideActive : ""}`}><Clock3 size={17} /> Time</Link>
          <div className={styles.sidebarLabel}>CONVERSATIONS <button type="button" aria-label="Add conversation">+</button></div>
          <Link href="/chat" className={`${styles.sideLink} ${pathname === "/chat" ? styles.sideActive : ""}`}><MessageCircle size={17} /> # general</Link>
          <Link href="/chat" className={styles.sideLink}><MessageCircle size={17} /> # design</Link>
          <Link href="/chat" className={styles.sideLink}><MessageCircle size={17} /> # development</Link>
          <div className={styles.sidebarLabel}>PEOPLE <button type="button" aria-label="Add people">+</button></div>
          {["Maya Chen", "Alex Rivera", "Jordan Lee"].map((name, index) => (
            <div className={styles.personRow} key={name}><Avatar initials={["MC", "AR", "JL"][index]} small /><span>{name}</span><i className={styles.online} /></div>
          ))}
          <div className={styles.sideFooter}><Link href="/settings"><Settings size={17} /> Settings</Link><span>v1.0.0</span></div>
        </aside>
        <main className={styles.main}>{children}</main>
        <aside className={styles.contextPanel}>
          <div className={styles.contextHeading}>Project members <button type="button" aria-label="Add member">+</button></div>
          {["MC", "AR", "JL", "SP"].map((initials) => <Avatar key={initials} initials={initials} small />)}
          <div className={styles.contextRule} />
          <div className={styles.contextHeading}>Linked docs</div>
          <Link className={styles.contextDoc} href="/docs"><FileText size={15} /> Sprint 3 planning</Link>
          <Link className={styles.contextDoc} href="/docs"><FileText size={15} /> Project brief</Link>
          <div className={styles.contextRule} />
          <div className={styles.contextHeading}>Files</div>
          <a className={styles.contextDoc} href="/docs"><FileText size={15} /> Design handoff.fig</a>
          <a className={styles.contextDoc} href="/docs"><FileText size={15} /> API notes.pdf</a>
          <div className={styles.contextRule} />
          <div className={styles.contextHeading}>Up next</div>
          <div className={styles.upNext}><span>Today · 2:30 PM</span><strong>Design review</strong><small>4 attendees</small></div>
          <div className={styles.upNext}><span>Tomorrow · 10:00 AM</span><strong>Sprint planning</strong><small>Team meeting</small></div>
        </aside>
      </div>
      <ThemeBar />
    </div>
  );
}
