# GitHub and Bitbucket integration

Synk shows pull requests on the tickets they belong to. This covers PRD section 6.7 (FR-B1 to FR-B4). The PRD names Bitbucket; GitHub works the same way, because both sit behind one small provider interface.

## What it does

| Requirement | How Synk meets it |
|---|---|
| FR-B1: an admin connects an account and selects repositories | **Board → Repositories** (workspace admins). "Connect GitHub" or "Connect Bitbucket" signs in to the code host with repository access. The admin then picks one of their repositories and links it to the project. |
| FR-B2: link a pull request by hand, or by naming the ticket key | Paste a pull request address into the ticket's **Pull requests** section. Or put the key, for example `SYN-12`, in the pull request's title or branch name, in any letter case. |
| FR-B3: a ticket shows its pull requests and their status | Each one is listed with its title, repository, number, branch, author and status: Open, Merged or Declined. |
| FR-B4: status changes update the ticket | A webhook from the code host updates the pull request as it changes. **Sync now** does the same on demand. When a pull request is merged and the ticket is not done, the ticket asks "Move to Done?". |

## How it works

- **Connecting.** There is no second OAuth app. "Connect" is the existing GitHub or Bitbucket sign-in, and the token NextAuth stores for that sign-in is what Synk uses to read repositories. GitHub is asked for the `repo` scope at this point; a plain GitHub sign-in does not have it and does not count as connected.
- **Linking a repository.** Synk asks the code host for the repository with the admin's token. This proves the admin can read it. A random webhook secret is created for it.
- **Reading later.** Syncing and attaching by address use the sign-in of the person who linked the repository, so teammates do not need a code-host account. If that person leaves the workspace, the repository asks to be unlinked and linked again.
- **Attaching.** For each pull request, Synk looks for the project's ticket keys in the title and branch name and attaches it to those tickets. A pull request can be on several tickets. Pasting an address attaches it to one ticket even without a key; its repository must already be linked to the ticket's project.
- **Webhooks.** `POST /api/integrations/github/webhook` and `/api/integrations/bitbucket/webhook` take no session. Each delivery must carry an HMAC-SHA256 signature of the exact body, made with the repository's secret (`X-Hub-Signature-256` on GitHub, `X-Hub-Signature` on Bitbucket). An unknown repository and a wrong signature get the same 401.

Code: [`src/features/integrations`](../src/features/integrations). `providers/` holds the GitHub and Bitbucket clients, `service.ts` the rules, `refs.ts` the key and address parsing, `tokens.ts` the stored sign-in tokens.

## Who can do what

| Action | Who |
|---|---|
| Connect an account, link or unlink a repository, see the webhook secret | Workspace admins |
| Sync a repository, attach or remove a pull request | People who can edit the project |
| See a ticket's pull requests | People who can view the project |

## Setting it up

1. Set up GitHub or Bitbucket sign-in as described in [setup.md](setup.md#github-and-bitbucket). The Bitbucket OAuth consumer also needs the **Repositories: Read** and **Pull requests: Read** permissions.
2. As a workspace admin, open **Board**, choose the project and press **Repositories**.
3. Press **Connect GitHub** (or Bitbucket), approve the access on the code host, and you are brought back to the panel.
4. Choose a repository and press **Link repository**, then **Sync now**.

### Live updates

Without a webhook, pull requests update when someone presses **Sync now**. For live updates, add a webhook in the repository's settings on the code host:

| Setting | Value |
|---|---|
| URL | Shown in the panel under "Set up live updates (webhook)": `{NEXTAUTH_URL}/api/integrations/github/webhook` or `.../bitbucket/webhook` |
| Content type | `application/json` |
| Secret | Shown in the same place. Each linked repository has its own. |
| Events | Pull requests (on Bitbucket: created, updated, merged, declined) |

The code host must be able to reach the URL, so this does not work with `http://localhost:3000` unless you use a tunnel.
