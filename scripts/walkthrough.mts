// Times the PRD's core flow (section 15): a new person signs up, creates a workspace and has the AI create
// their first ticket, which then shows on the board. Target: under 5 minutes. Uses the real model, so the
// agent must be running (npm run agent:up) and it costs one or two model requests. If Synk is not on port 3000,
// start the agent with NEXTJS_API_URL=http://host.docker.internal:<port> so its tool calls reach this server.
//
//   npm run build && npm start      (in one terminal, with the agent running)
//   npm run test:walkthrough        (in another; add WALKTHROUGH_HEADED=1 to watch it)
import { chromium } from "@playwright/test";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const base = process.env.LOAD_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const nonce = crypto.randomUUID().slice(0, 8);
const browser = await chromium.launch({ headless: !process.env.WALKTHROUGH_HEADED });
const page = await browser.newPage({ baseURL: base });
page.setDefaultTimeout(120_000);
const steps: [string, number][] = [];
const started = performance.now();
const mark = (step: string) => steps.push([step, (performance.now() - started) / 1000]);

try {
  await page.goto("/create-workspace");
  await page.getByLabel("Full name").fill("Walkthrough Person");
  await page.getByLabel("Work email").fill(`walkthrough-${nonce}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(`Walkthrough-${nonce}-pass!`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Workspace name").fill(`Walkthrough ${nonce}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.waitForURL(/\/w\/[^/]+\/(overview|settings)/);
  mark("Account and workspace created");

  await page.getByRole("button", { name: "Ask Synk AI" }).click();
  await page.getByLabel("Message Synk AI").fill("Create a high priority ticket called Fix login bug");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("region", { name: "Actions taken" }).getByText(/Created [A-Z0-9]+-1/).waitFor();
  mark("Synk AI created the ticket");

  await page.goto("/board");
  await page.getByRole("button", { name: "Fix login bug", exact: true }).waitFor();
  mark("Ticket shows on the board");
} catch (error) {
  await page.screenshot({ path: "test-results/walkthrough-failure.png", fullPage: true });
  console.error("Stopped; see test-results/walkthrough-failure.png");
  throw error;
} finally {
  await browser.close();
}

const total = steps.at(-1)![1];
console.log("\n| Step | Seconds since start |\n|---|---:|");
for (const [step, seconds] of steps) console.log(`| ${step} | ${seconds.toFixed(1)} |`);
console.log(`\nTotal: ${total.toFixed(1)} s. Target: under 300 s. A person typing by hand takes longer than this script.`);
process.exitCode = total < 300 ? 0 : 1;
