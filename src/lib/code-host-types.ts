// Shapes shared by the code-host (GitHub and Bitbucket) API and its client components.
export type CodeHost = "GITHUB" | "BITBUCKET";
export type PullRequestStatus = "OPEN" | "MERGED" | "DECLINED";

export const CODE_HOSTS: Record<CodeHost, { label: string; signInId: "github" | "bitbucket" }> = {
  GITHUB: { label: "GitHub", signInId: "github" },
  BITBUCKET: { label: "Bitbucket", signInId: "bitbucket" },
};

// `available` is false when the server has no OAuth app for the host; `connected` when this person has signed in to it with repository access.
export type HostConnection = { provider: CodeHost; available: boolean; connected: boolean };
// A repository on the code host that the signed-in person can read.
export type RemoteRepository = { fullName: string; url: string; isPrivate: boolean };
// `webhook` is only sent to workspace admins, who set it up on the code host.
export type LinkedRepository = {
  id: string; provider: CodeHost; fullName: string; url: string; connectedBy: string | null; pullRequestCount: number;
  webhook: { url: string; secret: string } | null;
};
export type TicketPullRequest = {
  id: string; number: number; title: string; url: string; status: PullRequestStatus; branch: string; author: string | null;
  updatedAt: string; repository: { provider: CodeHost; fullName: string };
};
// `linkable` is false when the ticket's project has no linked repository, so there is nothing to attach from.
export type TicketPullRequests = { pullRequests: TicketPullRequest[]; linkable: boolean };
export type SyncResult = { scanned: number; linked: number };
