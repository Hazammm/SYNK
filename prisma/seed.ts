import { loadEnvConfig } from "@next/env";
import { hash } from "bcryptjs";
loadEnvConfig(process.cwd(), true);

async function seed() {
  const { db } = await import("../src/lib/db");
  const { registerSchema } = await import("../src/lib/validation");
  const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
  const { listChannels, joinChannel, sendMessage } = await import("../src/features/chat/service");
  const { listProjects, createProject, setProjectAccess, getProject } = await import("../src/features/projects/service");
  const { createSprint, createTicket, updateSprint } = await import("../src/features/tickets/service");
  const { createDoc } = await import("../src/features/docs/service");
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
    let project = (await listProjects(admin.id, workspace.id)).find(item => item.key === "SYN");
    if (!project) {
      project = await createProject(admin.id, workspace.id, { name: "FYP", key: "SYN" });
      // Start numbering at 101 so the demo ticket is SYN-101, as referenced in chat.
      await db.project.update({ where: { id: project.id }, data: { nextTicketNumber: 101 } });
    }
    for (const user of [admin, member]) await setProjectAccess(admin.id, project.id, { userId: user.id, level: "WRITE" });
    if (!(await db.ticket.count({ where: { projectId: project.id, key: "SYN-101" } }))) {
      const board = (await getProject(admin.id, project.id)).boards[0];
      await createTicket(admin.id, { boardId: board.id, title: "Verify live workspace chat", description: "Check live delivery, threads and access control using the manual QA plan.", priority: "HIGH", assigneeId: member.id });
    }
    // A running sprint with some finished work, so the reports and overview have something to show.
    const detail = await getProject(admin.id, project.id);
    if (!detail.sprints.length) {
      const board = detail.boards[0], [todo, doing] = board.columns, done = board.columns.find(column => column.isDone) ?? todo;
      const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const sprint = await createSprint(admin.id, project.id, { name: "Sprint 4", goal: "Ship issue tracking and sprint reports", startDate: day(-4), endDate: day(9) });
      const work: [string, typeof todo, typeof admin, "HIGH" | "MEDIUM" | "LOW", number | null][] = [
        ["Drag tickets between board columns", done, member, "HIGH", -3], ["Sprint burndown report", done, admin, "MEDIUM", -1],
        ["Ticket comments with mentions", doing, member, "MEDIUM", null], ["Workspace overview page", todo, admin, "LOW", null],
      ];
      for (const [title, column, assignee, priority, finished] of work) {
        const ticket = await createTicket(admin.id, { boardId: board.id, title, priority, sprintId: sprint.id, columnId: column.id, assigneeId: assignee.id });
        // Spread completion over earlier days so the burndown has a shape.
        if (finished !== null) await db.ticket.update({ where: { id: ticket.id }, data: { completedAt: new Date(Date.now() + finished * 86_400_000) } });
      }
      await updateSprint(admin.id, sprint.id, { state: "ACTIVE" });
    }
    // A few pages, so docs and the assistant's search have something to show.
    if (!(await db.doc.count({ where: { projectId: project.id } }))) {
      const brief = await createDoc(admin.id, project.id, { title: "Project brief", content: "## Goals\n\n- Ship chat, issue tracking and the AI assistant\n- Keep every action inside each person's permissions\n\n## Team\n\nDemo Admin leads; Demo Member builds the board. See SYN-101." });
      await createDoc(admin.id, project.id, { parentId: brief.id, title: "Auth design spec", content: "## Authentication\n\nSign-in uses NextAuth with email and password, plus optional Google, GitHub and Bitbucket.\n\n- [x] Password reset\n- [ ] Email verification" });
      await createDoc(member.id, project.id, { title: "Sprint 4 retro", content: "## What went well\n\n- Drag and drop on the board\n\n## To improve\n\n- Write tests earlier" });
    }
    await sendMessage(admin.id, channel.id, { body: "Welcome! Our chat verification ticket is SYN-101.", clientMessageId: "b714897c-59df-425e-8567-1600f64ea760" });
    if (!(await db.membership.count({ where: { userId: outsider.id } }))) await createWorkspace(outsider.id, { name: "Separate Demo Workspace" });
    console.log("Demo ready: admin@synk.test, member@synk.test, outsider@synk.test. Existing passwords were not changed.");
  } finally { await db.$disconnect(); }
}
seed().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
