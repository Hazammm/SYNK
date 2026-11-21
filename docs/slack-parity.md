# Slack parity features

This work closes the gaps found in the Synk vs Slack comparison and the review notes. Every feature below has a server check, so hiding a button is never the only protection.

## Chat

| Feature | How it works |
|---|---|
| Threads inbox | **Threads** in the chat sidebar lists threads you started or replied in, most recently active first. |
| Also send to channel | The thread composer has "Also send to #channel". The reply shows in the channel too, labelled "replied to a thread". |
| Save for later | The bookmark on a message saves it. **Saved for later** in the sidebar lists your saved messages; opening one jumps to it. |
| Copy link | Copies `/w/<workspace>/chat/<channel>?message=<id>`. Opening the link scrolls to the message and highlights it. |
| Mark unread | Marks a message and everything after it as unread for you. |
| Channel settings | The channel's creator and workspace admins can rename it, make it announcement-only, make it private, archive or unarchive it, and remove members. The default channel can't be archived, made private or have members removed. |
| Announcement-only | Only admins and the creator post new messages; everyone can still reply in threads. |
| Archive | History stays readable, but nobody can post until it is unarchived. |
| Mute | The bell in the channel header. A muted conversation only alerts you when you are @mentioned by name. |
| Mentions | `@Full Name` works for names with spaces, as do `@channel` and `@here`. |
| Presence | Green dots show who is online as soon as chat opens, not only people who connect afterwards. Away people show as offline. |

## Alerts and notifications

* Alerts now include chat: mentions, direct messages, thread replies and reactions, next to ticket alerts. They can be filtered by kind.
* New alerts arrive live. With **Desktop notifications** on (Settings, Notifications), the browser shows a notification while Synk is in the background.
* **Pause notifications** (30 minutes to tomorrow morning) and **Focus mode** (pause plus a "Focusing" status) stop pop-ups. Alerts are still kept in the list.
* Each kind of alert can be turned off, including thread replies and reactions.

## People and profiles

* Profile: title, phone, location, time zone, pronouns and a profile photo (PNG, JPEG, GIF or WebP, up to 2 MB, checked by its content, not its name). Photos are only shown to people who share a workspace.
* Status: an emoji and text, presets (In a meeting, Working from home, On vacation and others), a time to clear it, and "Set yourself as away". The status shows in the profile menu and the directory.
* **People** in the sidebar: a directory with search and filters by title, location and online now. It shows each person's local time and a Message button.

## Search and navigation

* **Ctrl+K** (⌘K on a Mac) opens a quick switcher for pages, channels, direct messages and people. Enter on "Search everything" opens the full results.
* Message search understands `from:@name` (or `from:"Full Name"`), `in:#channel`, `before:YYYY-MM-DD`, `after:YYYY-MM-DD`, `has:link` and `has:file`. With any of these, only messages are searched.
* Message results link to the message itself.

## Security

**Two-factor sign-in** (Settings, Password and security) uses an authenticator app (TOTP, RFC 6238, 6 digits, 30 seconds).

* Turning it on needs a code from the app.
* You get 8 one-time recovery codes. They are stored hashed, and each works once.
* The secret is stored encrypted with a key derived from `NEXTAUTH_SECRET`.
* The sign-in page asks for the code only after the password is right.
* Turning it off needs both the password and a code.
* It applies to password sign-in; Google and code-host sign-in rely on that provider's own two-step verification.

## Workspaces

Sign-up asks "What will you use Synk for?" (optional).

**Workspace admin** (Settings, admins only) has:

* **Rename**: changes the workspace name.
* **Who can invite**: lets every member invite people, not only admins.
* **Usage**: members, active members, messages in the last 7 and 30 days, tickets created and completed, and messages per day for two weeks.
* **Export data**: a JSON file of members, public channels and their messages, and projects with their tickets. Private channels and direct messages are left out.

## Not included, and why

| Feature | Reason |
|---|---|
| Huddles and calls | Need a media server (WebRTC SFU) and TURN hosting. |
| Paid plans | Need a payment provider and pricing decisions. |
| Dropbox and OneDrive | Need developer app registrations. Google Drive is already connected. |
| SSO/SCIM, eDiscovery, legal hold | Enterprise features that need an identity provider and compliance work. |
| Native mobile and desktop apps, an app directory, translations | Separate products; the web app is responsive. |
