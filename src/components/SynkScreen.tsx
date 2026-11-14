"use client";

import OverviewView from "@/features/overview/OverviewView";
import AlertsList from "@/features/notifications/AlertsList";
import Tracker from "@/features/tickets/Tracker";
import type { Selection } from "@/features/tickets/ui";
import type { WorkspaceSummary } from "@/lib/chat-types";
import styles from "./Synk.module.css";

export type ScreenName = "overview" | "alerts" | "board" | "backlog" | "reports";

// Picks the view for a workspace route; every screen gets the workspace from the URL.
export default function SynkScreen({
  screen,
  workspaceId,
  userId,
  userName,
  initialWorkspaces = [],
  initialSelection = {},
}: {
  screen: ScreenName;
  workspaceId: string;
  userId: string;
  userName: string;
  initialWorkspaces?: WorkspaceSummary[];
  initialSelection?: Selection;
}) {
  return (
    <div className={styles.screen}>
      {screen === "overview"
        ? <OverviewView userName={userName} initialWorkspaces={initialWorkspaces} initialWorkspaceId={initialSelection.workspaceId ?? workspaceId} />
        : screen === "alerts"
          ? <AlertsList />
          : <Tracker
              view={screen === "backlog" ? "sprints" : screen}
              userId={userId}
              initialWorkspaces={initialWorkspaces}
              initial={{ ...initialSelection, workspaceId: initialSelection.workspaceId ?? workspaceId }}
            />}
    </div>
  );
}
