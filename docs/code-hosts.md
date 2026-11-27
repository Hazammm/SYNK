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

- **Connecting.** There is no second OAuth app. "Connect" is the existing GitHub or Bitbucket sign-in, and the token NextAuth stores for that sign-in is what Synk uses to read repositories. GitHub is asked for the `repo` scope at this point; a plain GitHub sign-in does not have it and does not count as connected. Bitbucket is asked for `account email repository pullrequest`; a plain Bitbucket sign-in asks only for `account email`.
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

## Troubleshooting

| What you see | What it means |
|---|---|
| Bitbucket returns `invalid_scope` | The OAuth consumer lacks a permission Synk asks for. Give it Account: Read, Email, Repositories: Read and Pull requests: Read. |
| An Atlassian page says "grant_type is not enabled for client" | Atlassian's own login failed before Bitbucket reached Synk, often when signing in through Google or Microsoft inside an embedded browser. Sign in at bitbucket.org first in a normal browser, then press Connect again. |
| The panel still says "Connect GitHub" after approving | The sign-in did not include the `repo` scope. Press Connect again and approve repository access. |

## API

| Method and path | Purpose |
|---|---|
| `GET /api/integrations` | Which code hosts the server offers, and which the signed-in person has connected |
| `GET /api/integrations/{github\|bitbucket}/repos` | The signed-in person's repositories on that host |
| `POST /api/integrations/{github\|bitbucket}/webhook` | Deliveries from the code host |
| `GET`, `POST /api/projects/{id}/repositories` | List a project's repositories; link one with `{ provider, fullName }` |
| `DELETE /api/repositories/{id}` | Unlink a repository and remove its pull requests from tickets |
| `POST /api/repositories/{id}/sync` | Read recent pull requests and attach or refresh them |
| `GET`, `POST /api/tickets/{id}/pull-requests` | List a ticket's pull requests; attach one with `{ url }` |
| `DELETE /api/pull-requests/{id}` | Remove a pull request from a ticket |

## Tests

- `tests/integrations.integration.test.mts`: the rules against PostgreSQL, with the code hosts replaced by canned replies. Covers permissions, key matching, syncing, attaching by address, signed and unsigned webhooks, an expired sign-in and Bitbucket token refresh.
- `tests/unit.test.ts`: key and address parsing, repository names, signatures, and how each host's statuses map to Open, Merged and Declined.
- `tests/e2e/pull-requests.spec.mts`: in a browser, a signed webhook puts a pull request on its ticket, and a merge offers "Move to Done".

The sign-in round trip to GitHub or Bitbucket itself is not covered by automated tests, because it needs a real account.

## Limits

- GitHub has no read-only scope for private repositories in OAuth apps, so `repo` also allows writing. Synk only reads.
- Tokens are stored in the `Account` table as NextAuth stores them, without extra encryption.
- A sync reads the 100 most recently updated pull requests on GitHub and 50 on Bitbucket. The repository picker lists the 100 most recently active repositories.
- Webhooks are added by hand on the code host; Synk does not register them.
- Commits and branches without a pull request are not shown.
