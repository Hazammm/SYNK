# GitHub and Bitbucket integration

Synk shows pull requests on the tickets they belong to. This covers PRD section 6.7 (FR-B1 to FR-B4). The PRD names Bitbucket; GitHub works the same way, because both sit behind one small provider interface.

## What it does

| Requirement | How Synk meets it |
|---|---|
| FR-B1: an admin connects an account and selects repositories | **Board → Repositories** (workspace admins). "Connect GitHub" or "Connect Bitbucket" signs in to the code host with repository access. The admin then picks one of their repositories and links it to the project. |
| FR-B2: link a pull request by hand, or by naming the ticket key | Paste a pull request address into the ticket's **Pull requests** section. Or put the key, for example `SYN-12`, in the pull request's title or branch name, in any letter case. |
| FR-B3: a ticket shows its pull requests and their status | Each one is listed with its title, repository, number, branch, author and status: Open, Merged or Declined. |
| FR-B4: status changes update the ticket | A webhook from the code host updates the pull request as it changes. **Sync now** does the same on demand. When a pull request is merged and the ticket is not done, the ticket asks "Move to Done?". |
