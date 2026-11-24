# Security policy

Synk handles sign-in, private messages and project data, so we take security reports seriously.

## Supported versions

Only the latest code on the `main` branch gets security fixes. There are no separate release branches yet.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately on GitHub instead:

1. Go to the **Security** tab of this repository.
2. Choose **Report a vulnerability**.
3. Describe the problem, where it is, and the steps to reproduce it.

If that option is not available, email a maintainer through the address on their GitHub profile, with "Security" in the subject.

Please include:

- What an attacker could do (for example, read another workspace's messages).
- The affected route, page or file, and the steps to reproduce.
- Any proof-of-concept request or screenshot. Use only test accounts and your own data.

## What to expect

- We confirm we received your report within **3 working days**.
- We tell you what we found within **10 working days**.
- Once a fix is merged, we credit you in the pull request, unless you prefer to stay anonymous.

## In scope

- Getting around sign-in or sessions: login, two-factor sign-in, password reset, invitations, OAuth.
- Seeing or changing data you should not have access to: workspaces, channels, direct messages, projects, tickets, pages, files.
- Problems in the real-time socket server, such as receiving events for channels you have not joined.
- Server-side request forgery, for example through link previews or webhooks.
- Getting the AI assistant to act beyond the permissions of the person using it.
- Stored or reflected cross-site scripting, and file upload issues such as profile photos, custom emoji and attachments.

## Out of scope

- Reports from automated scanners with no proof that the issue can be exploited.
- Missing security headers that cannot be exploited.
- Denial of service through heavy traffic.
- Problems that need physical access to a device, or a device that is already compromised.
- Issues in third-party services (Google, GitHub, Bitbucket, Mailtrap, the Gemini API) rather than in Synk.

## Our security practices

Sessions can be revoked. Tokens for invitations, password resets, webhooks and recovery codes are stored only as hashes. Permissions are checked on the server for every request and socket event, and browser writes must come from the same origin. The [README](README.md#key-ideas) and [docs/ai-agent.md](docs/ai-agent.md) describe the model in more detail.
