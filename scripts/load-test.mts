// Measures API response times against a running Synk (PRD section 15: p95 under 500 ms for CRUD endpoints).
// Signs in as a seeded demo user, then sends each request many times with a few in flight at once.
//
//   npm run db:seed && npm run build && npm start      (in one terminal)
//   npm run test:load                                  (in another)
//
// Settings: LOAD_BASE_URL (default NEXTAUTH_URL or http://localhost:3000), LOAD_EMAIL (default admin@synk.test),
// SEED_DEMO_PASSWORD, LOAD_REQUESTS per endpoint (default 200), LOAD_CONCURRENCY (default 10).
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const base = process.env.LOAD_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const email = process.env.LOAD_EMAIL ?? "admin@synk.test";
const password = process.env.SEED_DEMO_PASSWORD;
const requests = Number(process.env.LOAD_REQUESTS ?? 200);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10);
// Writes stay under the per-person limit of 120 tracker writes and 60 messages a minute.
const writes = Math.min(requests, 50);
if (!password) throw new Error("Set SEED_DEMO_PASSWORD to the demo accounts' password.");

let cookie = "";
const remember = (response: Response) => {
  const jar = new Map(cookie.split("; ").filter(Boolean).map(pair => [pair.split("=")[0], pair]));
  for (const header of response.headers.getSetCookie()) { const pair = header.split(";")[0]; jar.set(pair.split("=")[0], pair); }
  cookie = [...jar.values()].join("; ");
};
const call = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(base + path, { ...init, redirect: "manual", headers: { cookie, origin: base, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
  remember(response);
  return response;
};
const json = async <T,>(path: string) => {
  const response = await call(path);
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json() as Promise<T>;
};

// Sign in the way the login form does.
const { csrfToken } = await json<{ csrfToken: string }>("/api/auth/csrf");
await call("/api/auth/callback/credentials", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken, email, password, json: "true" }).toString(),
});
if (!cookie.includes("session-token")) throw new Error(`Could not sign in as ${email}. Is the demo data seeded and the password right?`);

// Find the seeded workspace, project, board and channel.
const { workspaces } = await json<{ workspaces: { id: string; name: string }[] }>("/api/workspaces");
const workspace = workspaces.find(item => item.name === "Synk Demo") ?? workspaces[0];
const { projects } = await json<{ projects: { id: string; key: string }[] }>(`/api/workspaces/${workspace.id}/projects`);
const project = projects.find(item => item.key === "SYN") ?? projects[0];
const { project: detail } = await json<{ project: { boards: { id: string }[] } }>(`/api/projects/${project.id}`);
const boardId = detail.boards[0].id;
const { channels } = await json<{ channels: { id: string; name: string }[] }>(`/api/workspaces/${workspace.id}/channels`);
const channelId = (channels.find(item => item.name === "general") ?? channels[0]).id;

type Endpoint = { name: string; count: number; send: (index: number) => Promise<Response> };
const endpoints: Endpoint[] = [
  { name: "GET /api/me", count: requests, send: () => call("/api/me") },
  { name: "GET /api/workspaces", count: requests, send: () => call("/api/workspaces") },
  { name: "GET /api/workspaces/:id/projects", count: requests, send: () => call(`/api/workspaces/${workspace.id}/projects`) },
  { name: "GET /api/projects/:id", count: requests, send: () => call(`/api/projects/${project.id}`) },
  { name: "GET /api/tickets?boardId=", count: requests, send: () => call(`/api/tickets?boardId=${boardId}`) },
  { name: "GET /api/channels/:id/messages", count: requests, send: () => call(`/api/channels/${channelId}/messages`) },
  { name: "GET /api/notifications", count: requests, send: () => call("/api/notifications") },
  { name: "GET /api/workspaces/:id/overview", count: requests, send: () => call(`/api/workspaces/${workspace.id}/overview`) },
  { name: "POST /api/tickets", count: writes, send: index => call("/api/tickets", { method: "POST", body: JSON.stringify({ boardId, title: `Load test ticket ${index + 1}` }) }) },
  { name: "POST /api/channels/:id/messages", count: writes, send: index => call(`/api/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ body: `Load test message ${index + 1}`, clientMessageId: crypto.randomUUID() }) }) },
];

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)];
const rows: string[] = [];
let slowest = 0;
for (const endpoint of endpoints) {
  const times: number[] = [];
  let failures = 0, next = 0;
  // A few requests in flight at once, like several people using the app.
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < endpoint.count) {
      const index = next++;
      const started = performance.now();
      const response = await endpoint.send(index);
      await response.arrayBuffer();
      times.push(performance.now() - started);
      if (!response.ok) failures++;
    }
  }));
  times.sort((a, b) => a - b);
  const p95 = percentile(times, 95);
  slowest = Math.max(slowest, p95);
  rows.push(`| ${endpoint.name} | ${times.length} | ${percentile(times, 50).toFixed(0)} | ${p95.toFixed(0)} | ${times.at(-1)!.toFixed(0)} | ${failures} |`);
}

console.log(`\nSynk API response times in ms (${base}, ${concurrency} at a time)\n`);
console.log("| Endpoint | Requests | p50 | p95 | Max | Failed |\n|---|---:|---:|---:|---:|---:|");
console.log(rows.join("\n"));
console.log(`\nSlowest p95: ${slowest.toFixed(0)} ms. Target: under 500 ms.`);
console.log("The POST requests created load-test tickets and messages in the demo workspace.");
process.exitCode = slowest < 500 ? 0 : 1;
