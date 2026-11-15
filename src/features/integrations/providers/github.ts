import { z } from "zod";
import { hostGet, type Provider, type RemotePullRequest } from "./shared";

const API = "https://api.github.com";
const headers = { "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "synk" };
const repoSchema = z.object({ full_name: z.string(), html_url: z.string(), private: z.boolean() });
const pullSchema = z.object({
  number: z.number().int(), title: z.string(), html_url: z.string(), state: z.string(), merged_at: z.string().nullish(),
  head: z.object({ ref: z.string() }), user: z.object({ login: z.string() }).nullish(), updated_at: z.coerce.date(),
});
const webhookSchema = z.object({ pull_request: pullSchema, repository: z.object({ full_name: z.string() }) });

const repository = (repo: z.infer<typeof repoSchema>) => ({ fullName: repo.full_name, url: repo.html_url, isPrivate: repo.private });
// GitHub reports a merged pull request as closed with a merge time.
const pullRequest = (pull: z.infer<typeof pullSchema>): RemotePullRequest => ({
  number: pull.number, title: pull.title, url: pull.html_url, branch: pull.head.ref, author: pull.user?.login ?? null, updatedAt: pull.updated_at,
  status: pull.merged_at ? "MERGED" : pull.state === "open" ? "OPEN" : "DECLINED",
});

export const github: Provider = {
  label: "GitHub",
  signatureHeader: "x-hub-signature-256",
  // shortcut: the 100 most recently pushed repositories, add paging when someone has more
  listRepositories: async token => (await hostGet("GitHub", `${API}/user/repos?per_page=100&sort=pushed`, token, z.array(repoSchema), headers)).map(repository),
  getRepository: async (token, fullName) => repository(await hostGet("GitHub", `${API}/repos/${fullName}`, token, repoSchema, headers)),
  // shortcut: the 100 most recently updated pull requests per sync, add paging for busier repositories
  listPullRequests: async (token, fullName) =>
    (await hostGet("GitHub", `${API}/repos/${fullName}/pulls?state=all&sort=updated&direction=desc&per_page=100`, token, z.array(pullSchema), headers)).map(pullRequest),
  getPullRequest: async (token, fullName, number) => pullRequest(await hostGet("GitHub", `${API}/repos/${fullName}/pulls/${number}`, token, pullSchema, headers)),
  parseWebhook(requestHeaders, body) {
    if (requestHeaders.get("x-github-event") !== "pull_request") return null;
    const parsed = webhookSchema.safeParse(body);
    return parsed.success ? { fullName: parsed.data.repository.full_name, pullRequest: pullRequest(parsed.data.pull_request) } : null;
  },
};
