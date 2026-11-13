// Shapes shared by the account API, the settings page and the profile menu.
export type NotificationPreferences = { assigned: boolean; comments: boolean; mentions: boolean };
export type AccountWorkspace = { id: string; name: string; role: "ADMIN" | "MEMBER"; memberCount: number; adminCount: number };
export type Account = {
  id: string; name: string; email: string | null; createdAt: string;
  // False for accounts that only sign in with Google, GitHub or Bitbucket.
  hasPassword: boolean;
  providers: string[];
  notifications: NotificationPreferences;
  // Other signed-in browsers and devices, not counting this one.
  otherSessions: number;
  workspaces: AccountWorkspace[];
};
export const SETTINGS_SECTIONS = ["profile", "notifications", "appearance", "security", "workspaces", "assistant"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
