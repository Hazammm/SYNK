"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import WorkspaceMembers from "@/features/workspaces/WorkspaceMembers";
import OverviewView from "@/features/overview/OverviewView";
import AlertsList from "@/features/notifications/AlertsList";
import Tracker from "@/features/tickets/Tracker";
import type { Selection } from "@/features/tickets/ui";
import type { WorkspaceSummary } from "@/lib/chat-types";
import { type ThemeName, applyTheme } from "@/lib/theme";
import { Avatar, Card } from "./Primitives";
import styles from "./Synk.module.css";

type ScreenName = "overview" | "alerts" | "board" | "backlog" | "reports" | "docs" | "time" | "settings";

const pageDetails: Record<Exclude<ScreenName, "settings">, { title: string; message: string }> = {
  overview: { title: "Overview", message: "Workspace activity and project summaries will appear here when available." },
  alerts: { title: "Alerts", message: "You have no alerts." },
  board: { title: "Board", message: "There are no tickets in this workspace yet." },
  backlog: { title: "Backlog", message: "There are no tickets in the backlog yet." },
  reports: { title: "Reports", message: "Reports will appear after workspace activity is available." },
  docs: { title: "Documents", message: "There are no documents in this workspace yet." },
  time: { title: "Time tracking", message: "There are no tracked time entries yet." },
};

function EmptyScreen({ screen, workspaceId }: { screen: Exclude<ScreenName, "settings">; workspaceId: string }) {
  const { title, message } = pageDetails[screen];
  return (
    <>
      <PageHeader title={title} />
      {screen === "board" && (
        <nav className={styles.boardSubnav} aria-label="Board views">
          <Link className={styles.subnavActive} href={`/w/${workspaceId}/board`}>Board</Link>
          <Link href={`/w/${workspaceId}/board/backlog`}>Backlog</Link>
          <Link href={`/w/${workspaceId}/board/reports`}>Reports</Link>
        </nav>
      )}
      {screen === "backlog" && (
        <nav className={styles.boardSubnav} aria-label="Board views">
          <Link href={`/w/${workspaceId}/board`}>Board</Link>
          <Link className={styles.subnavActive} href={`/w/${workspaceId}/board/backlog`}>Backlog</Link>
          <Link href={`/w/${workspaceId}/board/reports`}>Reports</Link>
        </nav>
      )}
      <Card>
        <h2>{title === "Alerts" ? "All caught up" : "Nothing here yet"}</h2>
        <p className={styles.subtle}>{message}</p>
      </Card>
    </>
  );
}

function PageHeader({ title }: { title: string }) {
  return <div className={styles.pageHeader}><div><h1>{title}</h1></div></div>;
}

function Settings({
  workspaceId,
  role,
  userId,
  userName,
  userEmail,
  initialSection,
  inviteDeliveryFailed,
  welcomeEmailFailed,
}: {
  workspaceId: string;
  role: "ADMIN" | "MEMBER";
  userId: string;
  userName: string;
  userEmail: string;
  initialSection?: string;
  inviteDeliveryFailed: boolean;
  welcomeEmailFailed: boolean;
}) {
  const [section, setSection] = useState(initialSection === "Members" ? "Members" : "Profile");
  const nav = ["Profile", "Appearance", "Notifications", "Members", "Account"];
  const initials = userName.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return (
    <>
      <PageHeader title="Settings" />
      {welcomeEmailFailed && <p className={styles.memberNotice} role="alert">Your account is ready, but the welcome email could not be delivered. Check the Mailtrap configuration.</p>}
      <div className={styles.settingsLayout}>
        <nav className={styles.settingsNav} aria-label="Settings">
          {nav.map(item => (
            <button type="button" onClick={() => setSection(item)} className={section === item ? styles.settingsActive : ""} key={item}>
              {item}
            </button>
          ))}
        </nav>
        <div className={styles.settingsBody}>
          {section === "Profile" && (
            <Card>
              <h2>Profile</h2>
              <p className={styles.subtle}>Your account information.</p>
              <div className={styles.profileEdit}><Avatar initials={initials || "U"} /><div><strong>{userName}</strong><p className={styles.subtle}>{userEmail}</p></div></div>
              <div className={styles.formGrid}>
                <div className={styles.settingsField}>Workspace role<strong>{role === "ADMIN" ? "Admin" : "Member"}</strong></div>
              </div>
            </Card>
          )}
          {section === "Appearance" && (
            <Card>
              <h2>Appearance</h2>
              <p className={styles.subtle}>Choose how Synk looks on this device.</p>
              <div className={styles.themeCards}>
                {(["black", "white", "forest", "lavender"] as ThemeName[]).map(theme => (
                  <button type="button" data-swatch={theme} key={theme} className={styles.themeCard} onClick={() => applyTheme(theme)}>
                    <span className={styles.themePreview}><i /><i /><i /></span>
                    <strong>{theme[0].toUpperCase() + theme.slice(1)}</strong>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {section === "Notifications" && (
            <Card>
              <h2>Notifications</h2>
              <p className={styles.subtle}>Notification preferences are not available yet.</p>
            </Card>
          )}
          {section === "Members" && (
            <div className={styles.membersSettings}>
              <WorkspaceMembers workspaceId={workspaceId} role={role} userId={userId} inviteDeliveryFailed={inviteDeliveryFailed} />
            </div>
          )}
          {section === "Account" && (
            <Card>
              <h2>Account</h2>
              <p className={styles.subtle}>Sign out of your account.</p>
              <button onClick={() => void signOut({ callbackUrl: "/login" })} className={styles.logout}>Log out</button>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function SynkScreen({
  screen,
  workspaceId,
  role,
  userId,
  userName,
  userEmail,
  initialWorkspaces = [],
  initialSelection = {},
  initialSettingsSection,
  inviteDeliveryFailed = false,
  welcomeEmailFailed = false,
}: {
  screen: ScreenName;
  workspaceId: string;
  role: "ADMIN" | "MEMBER";
  userId: string;
  userName: string;
  userEmail: string;
  initialWorkspaces?: WorkspaceSummary[];
  initialSelection?: Selection;
  initialSettingsSection?: string;
  inviteDeliveryFailed?: boolean;
  welcomeEmailFailed?: boolean;
}) {
  return (
    <div className={styles.screen}>
      {screen === "settings"
        ? <Settings
            workspaceId={workspaceId}
            role={role}
            userId={userId}
            userName={userName}
            userEmail={userEmail}
            initialSection={initialSettingsSection}
            inviteDeliveryFailed={inviteDeliveryFailed}
            welcomeEmailFailed={welcomeEmailFailed}
          />
        : screen === "overview"
          ? <OverviewView userName={userName} initialWorkspaces={initialWorkspaces} initialWorkspaceId={initialSelection.workspaceId ?? workspaceId} />
          : screen === "alerts"
            ? <AlertsList />
            : screen === "board" || screen === "backlog" || screen === "reports"
              ? <Tracker
                  view={screen === "backlog" ? "sprints" : screen}
                  userId={userId}
                  initialWorkspaces={initialWorkspaces}
                  initial={{ ...initialSelection, workspaceId: initialSelection.workspaceId ?? workspaceId }}
                />
              : <EmptyScreen screen={screen} workspaceId={workspaceId} />}
    </div>
  );
}
