// Window event fired when alerts are marked as read, so the navigation badge can refresh its count.
export const NOTIFICATIONS_CHANGED = "synk-notifications-changed";

// Window event fired when you change your name or photo, so the profile button reloads them.
export const ACCOUNT_CHANGED = "synk-account-changed";

// Window event fired when you change your own status; detail is { userId, status }.
export const STATUS_CHANGED = "synk-status-changed";
