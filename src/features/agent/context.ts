import { db } from "../../lib/db";
import { requireWorkspace } from "../../lib/permissions";
import { getProject, listProjects } from "../projects/service";
import type { AgentContext } from "../../lib/agent-types";

const MAX_PROJECTS = 12;
const MAX_MEMBERS = 40;

// What the agent is told about the workspace before each turn, so it can use real project,
// status and people names. It only ever contains what the caller can already see.
export async function buildAgentContext(userId: string, workspaceId: string, now = new Date()): Promise<AgentContext> {
  const membership = await requireWorkspace(userId, workspaceId);
  const [user, workspace, summaries] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
    listProjects(userId, workspaceId),
  ]);
  const projects = await Promise.all(summaries.filter(project => project.level).slice(0, MAX_PROJECTS).map(project => getProject(userId, project.id)));
  return {
    today: now.toISOString().slice(0, 10),
    user: { name: user.name ?? "Member" },
    workspace: { name: workspace.name, role: membership.role === "ADMIN" ? "admin" : "member" },
    projects: projects.map(project => ({
      key: project.key, name: project.name, access: project.level === "WRITE" ? "edit" as const : "view" as const,
      boards: project.boards.map(board => ({ name: board.name, statuses: board.columns.map(column => column.name) })),
      members: project.members.flatMap(member => member.name ?? []).slice(0, MAX_MEMBERS),
      sprints: project.sprints.filter(sprint => sprint.state !== "COMPLETED").map(sprint => ({ name: sprint.name, state: sprint.state === "ACTIVE" ? "active" as const : "planned" as const })),
    })),
  };
}
