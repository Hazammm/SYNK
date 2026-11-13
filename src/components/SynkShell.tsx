"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { applyTheme, THEMES, useTheme } from "@/lib/theme";
import { NOTIFICATIONS_CHANGED } from "@/lib/events";
import AgentPanel from "@/features/agent/AgentPanel";
import ProfileMenu, { SettingsLink } from "./ProfileMenu";
import styles from "./Synk.module.css";

const tabs = [
  { label: "Overview", href: "/overview" },
  { label: "Chat", href: "/chat" },
  { label: "Board", href: "/board" },
  { label: "Docs", href: "/docs" },
  { label: "Time", href: "/time" },
  { label: "Alerts", href: "/alerts" },
];

export function ThemeBar() {
  const theme = useTheme();
  return (
    <div className={styles.themeBar} aria-label="Theme selection">
      <span className={styles.themeLabel}>Theme</span>
      {THEMES.map((item) => (
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

// The frame around every signed-in page: navigation, profile, settings and the assistant.
export default function SynkShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  // Refresh the alert badge on each navigation and whenever alerts are marked as read.
  useEffect(() => {
    const load = () => { fetch("/api/notifications?summary=1", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(body => { if (body) setUnread(body.unread); }).catch(() => {}); };
    load();
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, load);
  }, [pathname]);

  return <div className={styles.app}>
    <header className={styles.topbar}>
      <Link href="/overview" className={styles.brand} aria-label="Synk home"><span className={styles.brandMark}>s</span> synk</Link>
      <nav className={styles.topTabs} aria-label="Workspace navigation">
        {tabs.map(tab => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`${styles.topTab} ${active ? styles.topTabActive : ""}`}>
            {tab.label}{tab.href === "/alerts" && unread > 0 && <span className={styles.tabCount}>{unread > 99 ? "99+" : unread}<span className={styles.srOnly}> unread</span></span>}
          </Link>;
        })}
      </nav>
      <ProfileMenu userName={userName} />
      <SettingsLink className={`${styles.settingsLink} ${pathname === "/settings" ? styles.settingsActive : ""}`} />
      <button className={styles.signOut} onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>
    </header>
    <main>{children}</main><div className={styles.liveTheme}><ThemeBar /></div>
    <AgentPanel />
  </div>;
}
