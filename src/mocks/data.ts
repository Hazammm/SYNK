export type ThemeName = "black" | "white" | "forest" | "lavender";
export type TicketStatus = "To do" | "In progress" | "In review" | "Done";
export type Priority = "Low" | "Medium" | "High";

export interface TeamMember {
  name: string;
  initials: string;
  role: string;
}

export interface Ticket {
  id: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  assignee: TeamMember;
  subtasks: number;
  completedSubtasks: number;
  points: number;
  description: string;
}

export interface Activity {
  name: string;
  initials: string;
  action: string;
  target: string;
  time: string;
}

export interface Notification {
  id: number;
  kind: "Mention" | "Ticket" | "Doc";
  title: string;
  detail: string;
  time: string;
  unread: boolean;
}

export const members: TeamMember[] = [
  { name: "Maya Chen", initials: "MC", role: "Designer" },
  { name: "Alex Rivera", initials: "AR", role: "Developer" },
  { name: "Jordan Lee", initials: "JL", role: "Project lead" },
  { name: "Sam Patel", initials: "SP", role: "Researcher" },
];

export const tickets: Ticket[] = [
  {
    id: "SYN-12",
    title: "Login UI",
    status: "In progress",
    priority: "High",
    assignee: members[0],
    subtasks: 4,
    completedSubtasks: 2,
    points: 5,
    description: "Build the authentication screens and connect the email sign-in flow.",
  },
  {
    id: "SYN-18",
    title: "Update onboarding flow",
    status: "To do",
    priority: "Medium",
    assignee: members[1],
    subtasks: 3,
    completedSubtasks: 0,
    points: 3,
    description: "Simplify the first-run setup so new members can join their workspace.",
  },
  {
    id: "SYN-09",
    title: "Dashboard wireframes",
    status: "In review",
    priority: "Medium",
    assignee: members[2],
    subtasks: 2,
    completedSubtasks: 1,
    points: 5,
    description: "Review the latest overview and project dashboard layouts.",
  },
  {
    id: "SYN-04",
    title: "Set up project repo",
    status: "Done",
    priority: "Low",
    assignee: members[3],
    subtasks: 2,
    completedSubtasks: 2,
    points: 2,
    description: "Create the project repository and add the initial team access.",
  },
  {
    id: "SYN-21",
    title: "Design system tokens",
    status: "To do",
    priority: "Low",
    assignee: members[0],
    subtasks: 3,
    completedSubtasks: 1,
    points: 3,
    description: "Document the core colors, spacing and interaction states.",
  },
  {
    id: "SYN-15",
    title: "API integration notes",
    status: "In progress",
    priority: "High",
    assignee: members[1],
    subtasks: 5,
    completedSubtasks: 3,
    points: 8,
    description: "Map the frontend data requirements and integration sequence.",
  },
  {
    id: "SYN-07",
    title: "Research summary",
    status: "Done",
    priority: "Medium",
    assignee: members[3],
    subtasks: 2,
    completedSubtasks: 2,
    points: 3,
    description: "Summarize interview findings and share key product opportunities.",
  },
];

export const activity: Activity[] = [
  { name: "Maya Chen", initials: "MC", action: "moved", target: "SYN-12 Login UI to In progress", time: "12 min ago" },
  { name: "Alex Rivera", initials: "AR", action: "commented on", target: "SYN-18 Update onboarding flow", time: "38 min ago" },
  { name: "Jordan Lee", initials: "JL", action: "created", target: "Sprint 3 planning doc", time: "2 hours ago" },
  { name: "Sam Patel", initials: "SP", action: "completed", target: "SYN-04 Set up project repo", time: "Yesterday" },
];

export const notifications: Notification[] = [
  { id: 1, kind: "Mention", title: "Maya Chen mentioned you", detail: "“Alex, could you review the new login states?” in #design", time: "8 min ago", unread: true },
  { id: 2, kind: "Ticket", title: "SYN-12 was assigned to you", detail: "Login UI · Sprint 3", time: "42 min ago", unread: true },
  { id: 3, kind: "Doc", title: "Sprint 3 planning was updated", detail: "Jordan Lee edited the project brief", time: "2 hours ago", unread: false },
  { id: 4, kind: "Ticket", title: "SYN-09 is ready for review", detail: "Dashboard wireframes · In review", time: "Yesterday", unread: false },
];

export const weekHours = [
  { day: "Mon", date: "12", hours: 5.5 },
  { day: "Tue", date: "13", hours: 7 },
  { day: "Wed", date: "14", hours: 4.25 },
  { day: "Thu", date: "15", hours: 6.5 },
  { day: "Fri", date: "16", hours: 2 },
  { day: "Sat", date: "17", hours: 0 },
  { day: "Sun", date: "18", hours: 0 },
];
