// Shapes shared by the account API, the settings page and the profile menu.
export type NotificationPreferences = { assigned: boolean; comments: boolean; mentions: boolean; replies: boolean; reactions: boolean };
// Profile details teammates see. `image` is an uploaded photo or the one from Google, GitHub or Bitbucket.
export type ProfileDetails = { title: string; phone: string; location: string; timezone: string; pronouns: string; image: string | null };
// A status that has passed its expiry is reported as empty.
// `pausedUntil` is set while notifications are paused, and teammates see a "z" on the person's avatar.
export type PersonStatus = { text: string; emoji: string; expiresAt: string | null; away: boolean; pausedUntil: string | null };
export const isPaused = (status: PersonStatus | undefined, now = Date.now()) =>
  Boolean(status?.pausedUntil && new Date(status.pausedUntil).getTime() > now);
export type AccountWorkspace = { id: string; name: string; role: "ADMIN" | "MEMBER"; memberCount: number; adminCount: number };
export type Account = {
  id: string; name: string; email: string | null; createdAt: string;
  // False for accounts that only sign in with Google, GitHub or Bitbucket.
  hasPassword: boolean;
  providers: string[];
  notifications: NotificationPreferences;
  profile: ProfileDetails;
  status: PersonStatus;
  // Notifications are paused (snoozed or in focus mode) until this time, if set.
  notificationsPausedUntil: string | null;
  twoFactorEnabled: boolean;
  // Other signed-in browsers and devices, not counting this one.
  otherSessions: number;
  workspaces: AccountWorkspace[];
};
export const SETTINGS_SECTIONS = ["profile", "status", "notifications", "appearance", "security", "workspaces", "members", "admin", "assistant"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
