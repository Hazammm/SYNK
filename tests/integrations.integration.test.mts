import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
Object.assign(process.env, { GITHUB_ID: "test-id", GITHUB_SECRET: "test-secret", BITBUCKET_ID: "test-id", BITBUCKET_SECRET: "test-secret" });
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const { createProject, getProject, setProjectAccess } = await import("../src/features/projects/service");
const { createTicket, deleteTicket } = await import("../src/features/tickets/service");
const {
  linkPullRequest, linkRepository, listConnections, listPullRequests, listRemoteRepositories, listRepositories,
  receiveWebhook, syncRepository, unlinkPullRequest, unlinkRepository,
} = await import("../src/features/integrations/service");

// writer: WRITE. reader: READ. bystander: workspace member without project access.
let admin: string, writer: string, reader: string, bystander: string;
let workspaceId: string, projectId: string, boardId: string, ticket1: string, ticket2: string, repositoryId: string, secret: string;
const users: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const rejects = (promise: Promise<unknown>, code: number) => assert.rejects(promise, status(code));
// Input that fails validation; the API layer answers 400 for it.
const invalid = (promise: Promise<unknown>) => assert.rejects(promise, { name: "ZodError" });

// What the fake GitHub and Bitbucket hold. Tests change it to stand in for activity on the host.
type Pull = { number: number; title: string; branch: string; state: "open" | "closed"; merged?: boolean };
const hosted: { pulls: Pull[]; calls: { url: string; token: string }[]; githubStatus: number } = { pulls: [], calls: [], githubStatus: 200 };
const githubPull = (pull: Pull) => ({
  number: pull.number, title: pull.title, html_url: `https://github.com/acme/app/pull/${pull.number}`, state: pull.state,
  merged_at: pull.merged ? "2026-11-14T10:00:00Z" : null, head: { ref: pull.branch }, user: { login: "hazam" }, updated_at: "2026-11-14T10:00:00Z",
});
const bitbucketPull = { id: 7, title: "SYN-2 tidy the report", state: "MERGED", links: { html: { href: "https://bitbucket.org/acme/site/pull-requests/7" } }, updated_on: "2026-11-14T11:00:00Z", source: { branch: { name: "report" } }, author: { display_name: "Asra" } };
const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json" } });
const realFetch = globalThis.fetch;

before(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    hosted.calls.push({ url, token: String(new Headers(init?.headers).get("authorization") ?? "") });
    if (url === "https://bitbucket.org/site/oauth2/access_token") return json({ access_token: "bb-fresh", refresh_token: "bb-refresh-2", expires_in: 7200 });
    if (url.startsWith("https://api.bitbucket.org/2.0/repositories/acme/site/pullrequests")) return json({ values: [bitbucketPull] });
    if (url === "https://api.bitbucket.org/2.0/repositories/acme/site") return json({ full_name: "acme/site", is_private: true, links: { html: { href: "https://bitbucket.org/acme/site" } } });
    if (!url.startsWith("https://api.github.com/")) return json({}, 404);
    if (hosted.githubStatus !== 200) return json({ message: "Bad credentials" }, hosted.githubStatus);
    const path = url.slice("https://api.github.com".length).split("?")[0];
    if (path === "/user/repos") return json([{ full_name: "acme/app", html_url: "https://github.com/acme/app", private: true }]);
    if (path === "/repos/acme/app" || path === "/repos/ACME/App") return json({ full_name: "acme/app", html_url: "https://github.com/acme/app", private: true });
    if (path === "/repos/acme/app/pulls") return json(hosted.pulls.map(githubPull));
    const pull = hosted.pulls.find(item => path === `/repos/acme/app/pulls/${item.number}`);
    return pull ? json(githubPull(pull)) : json({ message: "Not Found" }, 404);
  }) as typeof fetch;

  for (const name of ["Admin", "Writer", "Reader", "Bystander"]) {
    users.push((await db.user.create({ data: { name, email: `synk-hosts-${randomUUID()}@example.test` } })).id);
  }
  [admin, writer, reader, bystander] = users;
  workspaceId = (await createWorkspace(admin, { name: "Code host workspace" })).id;
  for (const id of [writer, reader, bystander]) await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id } })).email);
  projectId = (await createProject(admin, workspaceId, { name: "Synk", key: "SYN" })).id;
  await setProjectAccess(admin, projectId, { userId: writer, level: "WRITE" });
  await setProjectAccess(admin, projectId, { userId: reader, level: "READ" });
  boardId = (await getProject(admin, projectId)).boards[0].id;
  ticket1 = (await createTicket(admin, { boardId, title: "Fix login" })).id; // SYN-1
  ticket2 = (await createTicket(admin, { boardId, title: "Write the report" })).id; // SYN-2
});

after(async () => {
  globalThis.fetch = realFetch;
  await db.workspace.deleteMany({ where: { id: workspaceId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

const github = (userId: string, scope: string) => db.account.create({
  data: { userId, type: "oauth", provider: "github", providerAccountId: randomUUID(), access_token: `gh-${userId}`, scope },
});
const titles = async (ticketId: string) => (await listPullRequests(admin, ticketId)).pullRequests.map(item => `${item.number}:${item.status}`).sort();

test("connections: GitHub counts as connected only once the sign-in granted repository access", async () => {
  const connected = async () => Object.fromEntries((await listConnections(admin)).map(item => [item.provider, [item.available, item.connected]]));
  assert.deepEqual(await connected(), { GITHUB: [true, false], BITBUCKET: [true, false] });
  await rejects(listRemoteRepositories(admin, "GITHUB"), 409); // not connected yet

  const signIn = await github(admin, "read:user,user:email"); // a plain sign-in
  assert.deepEqual((await connected()).GITHUB, [true, false]);
  await db.account.update({ where: { id: signIn.id }, data: { scope: "read:user,repo,user:email" } });
  assert.deepEqual((await connected()).GITHUB, [true, true]);

  assert.deepEqual(await listRemoteRepositories(admin, "GITHUB"), [{ fullName: "acme/app", url: "https://github.com/acme/app", isPrivate: true }]);
  assert.equal(hosted.calls.at(-1)?.token, `Bearer gh-${admin}`);
  await invalid(listRemoteRepositories(admin, "GITLAB"));
});

test("repositories: only workspace admins link them, and only ones their account can open", async () => {
  await rejects(linkRepository(writer, projectId, { provider: "GITHUB", fullName: "acme/app" }), 403);
  await rejects(linkRepository(admin, projectId, { provider: "GITHUB", fullName: "acme/secret" }), 404); // the host says no
  await invalid(linkRepository(admin, projectId, { provider: "GITHUB", fullName: "../../user" }));

  // The host's own spelling of the name is stored.
  const linked = await linkRepository(admin, projectId, { provider: "GITHUB", fullName: "ACME/App" });
  assert.deepEqual([linked.fullName, linked.url, linked.connectedBy, linked.pullRequestCount], ["acme/app", "https://github.com/acme/app", "Admin", 0]);
  assert.match(linked.webhook!.secret, /^[0-9a-f]{64}$/);
  assert.match(linked.webhook!.url, /\/api\/integrations\/github\/webhook$/);
  repositoryId = linked.id; secret = linked.webhook!.secret;
  await assert.rejects(linkRepository(admin, projectId, { provider: "GITHUB", fullName: "acme/app" })); // already linked

  // Everyone on the project sees the repository; only admins see the webhook secret.
  assert.equal((await listRepositories(admin, projectId))[0].webhook?.secret, secret);
  assert.equal((await listRepositories(writer, projectId))[0].webhook, null);
  assert.equal((await listRepositories(reader, projectId))[0].fullName, "acme/app");
  await rejects(listRepositories(bystander, projectId), 403);
});

test("sync: pull requests that name a ticket key attach to it, and a second sync updates them", async () => {
  hosted.pulls = [
    { number: 1, title: "SYN-1 fix the login redirect", branch: "fix-login", state: "open" },
    { number: 2, title: "Polish the report", branch: "feature/syn-2-report", state: "open" }, // key in the branch, lower case
    { number: 3, title: "SYN-1 and SYN-2 share a helper", branch: "helper", state: "closed" },
    { number: 4, title: "OTH-1 SYN-99 SYN-10 XSYN-1 nothing here", branch: "misc", state: "open" }, // no ticket matches
  ];
  await rejects(syncRepository(reader, repositoryId), 403);
  await rejects(syncRepository(bystander, repositoryId), 404);

  // A teammate with no GitHub account can sync: the linker's sign-in is used.
  assert.deepEqual(await syncRepository(writer, repositoryId), { scanned: 4, linked: 4 });
  assert.equal(hosted.calls.at(-1)?.token, `Bearer gh-${admin}`);
  assert.deepEqual(await titles(ticket1), ["1:OPEN", "3:DECLINED"]);
  assert.deepEqual(await titles(ticket2), ["2:OPEN", "3:DECLINED"]);

  hosted.pulls[0] = { ...hosted.pulls[0], state: "closed", merged: true };
  assert.deepEqual(await syncRepository(admin, repositoryId), { scanned: 4, linked: 0 });
  assert.deepEqual(await titles(ticket1), ["1:MERGED", "3:DECLINED"]);
  assert.equal((await listRepositories(admin, projectId))[0].pullRequestCount, 4);
});

test("attaching by address: needs a linked repository and edit access", async () => {
  hosted.pulls.push({ number: 5, title: "Unrelated cleanup", branch: "cleanup", state: "open" });
  const address = "https://github.com/acme/app/pull/5";
  await rejects(linkPullRequest(reader, ticket2, { url: address }), 403);
  await rejects(linkPullRequest(bystander, ticket2, { url: address }), 404);
  await rejects(linkPullRequest(writer, ticket2, { url: "https://example.com/acme/app/pull/5" }), 400);
  await rejects(linkPullRequest(writer, ticket2, { url: "https://github.com/acme/other/pull/5" }), 400); // not linked to this project
  await rejects(linkPullRequest(writer, ticket2, { url: "https://github.com/acme/app/pull/404" }), 404);

  const attached = await linkPullRequest(writer, ticket2, { url: address });
  assert.deepEqual([attached.number, attached.title, attached.status, attached.branch, attached.author, attached.repository.fullName], [5, "Unrelated cleanup", "OPEN", "cleanup", "hazam", "acme/app"]);
  assert.equal((await linkPullRequest(writer, ticket2, { url: address })).id, attached.id); // attaching twice keeps one
  const listed = await listPullRequests(reader, ticket2);
  assert.equal(listed.linkable, true);
  assert.ok(listed.pullRequests.some(item => item.id === attached.id));

  await rejects(unlinkPullRequest(reader, attached.id), 403);
  assert.deepEqual(await unlinkPullRequest(writer, attached.id), { deleted: true });
  await rejects(unlinkPullRequest(writer, attached.id), 404);
});

test("webhooks: a signed delivery updates the ticket; anything unsigned or unknown is refused", async () => {
  const delivery = (pull: Pull, fullName = "acme/app") => JSON.stringify({ action: "closed", pull_request: githubPull(pull), repository: { full_name: fullName } });
  const headers = (body: string, key: string, event = "pull_request") => new Headers({ "x-github-event": event, "x-hub-signature-256": `sha256=${createHmac("sha256", key).update(body).digest("hex")}` });

  const merged = delivery({ number: 2, title: "Polish the report", branch: "feature/syn-2-report", state: "closed", merged: true });
  await rejects(receiveWebhook("GITHUB", headers(merged, "wrong-secret"), merged), 401);
  await rejects(receiveWebhook("GITHUB", new Headers({ "x-github-event": "pull_request" }), merged), 401);
  const elsewhere = delivery({ number: 2, title: "SYN-2", branch: "x", state: "open" }, "acme/unknown");
  await rejects(receiveWebhook("GITHUB", headers(elsewhere, secret), elsewhere), 401);
  await rejects(receiveWebhook("GITHUB", headers("{not json", secret), "{not json"), 400);
  assert.ok((await titles(ticket2)).includes("2:OPEN")); // nothing above changed anything

  assert.deepEqual(await receiveWebhook("GITHUB", headers(merged, secret), merged), { ok: true, updated: 1 });
  assert.ok((await titles(ticket2)).includes("2:MERGED"));

  // A new pull request arrives by webhook alone.
  const opened = delivery({ number: 6, title: "syn-1: tighten validation", branch: "validation", state: "open" });
  await receiveWebhook("GITHUB", headers(opened, secret), opened);
  assert.ok((await titles(ticket1)).includes("6:OPEN"));

  // Other events are acknowledged without being checked or acted on.
  assert.deepEqual(await receiveWebhook("GITHUB", headers("{}", "anything", "ping"), "{}"), { ok: true, updated: 0 });
});

test("an expired GitHub sign-in is reported as needing to reconnect", async () => {
  hosted.githubStatus = 401;
  await assert.rejects(syncRepository(writer, repositoryId), (error: unknown) => status(409)(error) && /connect GitHub again/i.test((error as Error).message));
  hosted.githubStatus = 500;
  await rejects(syncRepository(writer, repositoryId), 502);
  hosted.githubStatus = 200;
});
