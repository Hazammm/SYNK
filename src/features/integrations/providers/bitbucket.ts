import { z } from "zod";
import { hostGet, type Provider, type RemotePullRequest } from "./shared";

const API = "https://api.bitbucket.org/2.0";
const link = z.object({ html: z.object({ href: z.string() }) });
const repoSchema = z.object({ full_name: z.string(), is_private: z.boolean(), links: link });
const pullSchema = z.object({
  id: z.number().int(), title: z.string(), state: z.string(), links: link, updated_on: z.coerce.date(),
  source: z.object({ branch: z.object({ name: z.string() }) }), author: z.object({ display_name: z.string() }).nullish(),
});
const page = <T extends z.ZodType>(item: T) => z.object({ values: z.array(item) });
const webhookSchema = z.object({ pullrequest: pullSchema, repository: z.object({ full_name: z.string() }) });

const repository = (repo: z.infer<typeof repoSchema>) => ({ fullName: repo.full_name, url: repo.links.html.href, isPrivate: repo.is_private });
// Bitbucket's SUPERSEDED means closed in favour of another pull request, which Synk shows as declined.
const pullRequest = (pull: z.infer<typeof pullSchema>): RemotePullRequest => ({
  number: pull.id, title: pull.title, url: pull.links.html.href, branch: pull.source.branch.name, author: pull.author?.display_name ?? null, updatedAt: pull.updated_on,
  status: pull.state === "MERGED" ? "MERGED" : pull.state === "OPEN" ? "OPEN" : "DECLINED",
});
const ALL_STATES = "state=OPEN&state=MERGED&state=DECLINED&state=SUPERSEDED";

export const bitbucket: Provider = {
  label: "Bitbucket",
  signatureHeader: "x-hub-signature",
  // shortcut: the 100 most recently updated repositories, add paging when someone has more
  listRepositories: async token => (await hostGet("Bitbucket", `${API}/repositories?role=member&pagelen=100&sort=-updated_on`, token, page(repoSchema))).values.map(repository),
  getRepository: async (token, fullName) => repository(await hostGet("Bitbucket", `${API}/repositories/${fullName}`, token, repoSchema)),
  // shortcut: the 50 most recently updated pull requests per sync (Bitbucket's page limit), add paging for busier repositories
  listPullRequests: async (token, fullName) =>
    (await hostGet("Bitbucket", `${API}/repositories/${fullName}/pullrequests?${ALL_STATES}&pagelen=50&sort=-updated_on`, token, page(pullSchema))).values.map(pullRequest),
  getPullRequest: async (token, fullName, number) => pullRequest(await hostGet("Bitbucket", `${API}/repositories/${fullName}/pullrequests/${number}`, token, pullSchema)),
  parseWebhook(headers, body) {
    if (!headers.get("x-event-key")?.startsWith("pullrequest:")) return null;
    const parsed = webhookSchema.safeParse(body);
    return parsed.success ? { fullName: parsed.data.repository.full_name, pullRequest: pullRequest(parsed.data.pullrequest) } : null;
  },
};
