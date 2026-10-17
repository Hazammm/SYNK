import { loadEnvConfig } from "@next/env";
import { hash } from "bcryptjs";
loadEnvConfig(process.cwd(), true);

async function seed() {
  const { db } = await import("../src/lib/db");
  const { registerSchema } = await import("../src/lib/validation");
  const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
  const { listChannels, joinChannel, sendMessage } = await import("../src/features/chat/service");
  const password = process.env.SEED_DEMO_PASSWORD;
  registerSchema.parse({ name: "Demo", email: "admin@synk.test", password });
  if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
  try {
    const passwordHash = await hash(password!, 12);
    const users = [];
    for (const [email, name] of [["admin@synk.test", "Demo Admin"], ["member@synk.test", "Demo Member"], ["outsider@synk.test", "Other Workspace User"]]) {
      users.push(await db.user.upsert({ where: { email }, create: { email, name, passwordHash }, update: {} }));
    }
    const [admin, member, outsider] = users;
    let workspace = await db.workspace.findFirst({ where: { name: "Synk Demo", memberships: { some: { userId: admin.id, role: "ADMIN" } } } });
    workspace ??= await createWorkspace(admin.id, { name: "Synk Demo" });
    await addMember(admin.id, workspace.id, member.email);
    const channel = (await listChannels(admin.id, workspace.id)).find(channel => channel.name === "general")!;
    await joinChannel(member.id, channel.id);
    let project = await db.project.findFirst({ where: { workspaceId: workspace.id, name: "FYP" } });
    project ??= await db.project.create({ data: { workspaceId: workspace.id, name: "FYP" } });
    for (const user of [admin, member]) await db.projectAccess.upsert({ where: { projectId_userId: { projectId: project.id, userId: user.id } }, create: { projectId: project.id, userId: user.id, level: "WRITE" }, update: {} });
    await db.ticket.upsert({ where: { projectId_key: { projectId: project.id, key: "SYN-101" } }, create: { projectId: project.id, key: "SYN-101", title: "Verify live workspace chat", description: "Check live delivery, threads and access control using the manual QA plan." }, update: {} });
    await sendMessage(admin.id, channel.id, { body: "Welcome! Our chat verification ticket is SYN-101.", clientMessageId: "b714897c-59df-425e-8567-1600f64ea760" });
    if (!(await db.membership.count({ where: { userId: outsider.id } }))) await createWorkspace(outsider.id, { name: "Separate Demo Workspace" });
    console.log("Demo ready: admin@synk.test, member@synk.test, outsider@synk.test. Existing passwords were not changed.");
  } finally { await db.$disconnect(); }
}
seed().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
