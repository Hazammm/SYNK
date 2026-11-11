# Issue tracking, sprint reports and overview

This covers PRD section 6.4 (issue tracking), the notification records of 6.9 that tickets create, and the sprint review journey (journey 8). It is the Sprint 4 deliverable in the PRD's delivery plan.

## Requirement coverage

| Requirement | Implementation |
| --- | --- |
| FR-T1 | Each project gets a board with To Do, In Progress, Review and Done. Columns can be renamed, reordered, added and removed; a column that still holds tickets cannot be removed. Any column can be marked as a "done" column. |
| FR-T2 | Tickets have a title, description, status column, priority, assignee, reporter, due date and comments. Keys such as `SYN-12` are numbered per project and never reused. |
| FR-T3 | Drag and drop with `@dnd-kit/core` (mouse, long-press and keyboard), or the status field in the ticket form. Both use `PATCH /api/tickets/:id`. |
| FR-T4 | Sprints have a name, goal and dates. One sprint per project can be active. Completing a sprint returns unfinished tickets to the backlog. Progress is done tickets over total. |
| FR-T5 | `GET /api/tickets` filters by assignee, priority, status column and sprint; the board applies the same filters. |
| FR-T6 | Comments notify the assignee and anyone @mentioned who can open the ticket. |
| FR-N1 / FR-N2 | Assignment, comment and mention notifications, an unread badge, and mark-as-read for one or all. PR notifications wait for the Bitbucket integration. |
| Journey 8 | The Reports view shows a burndown, velocity, status and assignee breakdowns, and exports the sprint's tickets as CSV. |

Tickets can also be deleted by anyone with edit access to the project. Deleting removes the ticket's comments and notifications.

## Access model

Every request goes through `can()` in `src/lib/permissions.ts`, which the AI agent will also use.

| Project level | Can do |
| --- | --- |
| No access | Nothing. A ticket in the project looks the same as one that does not exist (404). |
| `READ` | Open boards, tickets, sprints, reports and comments. |
| `WRITE` | Everything in `READ`, plus create, edit, move, comment on and delete tickets, and manage boards and sprints. |

Workspace admins create projects and grant access, but still need project access themselves to open tickets. Removing someone's project access unassigns their tickets and hides their notifications for that project.

## How reports are calculated

- **Completion time.** A ticket's `completedAt` is set when it enters a done column and cleared when it leaves. Marking a column as done, or unmarking it, updates the tickets in it. Tickets that were already in a done column before this was added use their last-updated time.
- **Burndown.** For each day of the sprint, remaining = committed tickets minus tickets completed by the end of that day (UTC). The ideal line falls evenly from the committed count to zero. Days after today have no value yet.
- **Committed.** The tickets in the sprint, plus the number carried over to the backlog when the sprint was completed (`Sprint.carriedOver`).
- **Velocity.** Tickets finished in each of the last six completed sprints.

The burndown measures ticket counts, not story points, because tickets have no estimate field. It also does not record scope changes: a ticket added mid-sprint counts as committed from the first day.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | `/api/workspaces/:id/projects` | List or create projects |
| GET | `/api/workspaces/:id/overview` | The caller's open tickets, counts and active sprints |
| GET | `/api/projects/:id` | Project with its boards, sprints and members |
| GET, PUT | `/api/projects/:id/access` | List or change project access (workspace admins) |
| POST | `/api/projects/:id/boards` | Create a board |
| PATCH | `/api/boards/:id` | Rename a board or change its columns |
| POST | `/api/projects/:id/sprints` | Create a sprint |
| PATCH | `/api/sprints/:id` | Edit, start or complete a sprint |
| GET | `/api/projects/:id/reports` | Sprint report; `?sprintId=` picks a sprint |
| GET, POST | `/api/tickets` | List with filters, or create a ticket |
| GET, PATCH, DELETE | `/api/tickets/:id` | Read, update or delete a ticket |
| POST | `/api/tickets/:id/comments` | Add a comment |
| GET, PATCH | `/api/notifications` | List notifications, or mark them as read |

The PRD lists tickets under `/api/boards/:id/tickets`. Tickets are listed through `/api/tickets?boardId=` instead, so the same endpoint can also list a whole project for the sprint view.

Writes require a signed-in session, a same-origin request and a JSON body within the size limit, and are rate limited per user.

## Structure

| Path | Purpose |
| --- | --- |
| `src/features/projects/` | Projects, project access and board records |
| `src/features/tickets/` | Ticket, board and sprint services, and the board, sprint and ticket screens |
| `src/features/reports/` | Report calculations (`calc.ts`), the report service and the Reports view |
| `src/features/overview/` | Overview service and page |
| `src/features/notifications/` | Notification service and the Alerts screen |
| `src/lib/csv.ts` | CSV builder that neutralises spreadsheet formulas |

## Tests

- `tests/unit.test.ts`: permissions, validation, burndown maths and CSV escaping.
- `tests/tickets.integration.test.mts`: projects, tickets, moves, filters, comments, deletion, completion times, boards and sprints.
- `tests/reports.integration.test.mts`: sprint reports, velocity and the overview.
- `tests/e2e/tracker.spec.ts`: a browser run through project creation, a ticket's lifecycle, deletion, a sprint, the report, CSV export and the overview.

## Not done yet

- Email invitations to a workspace (FR-W2); teammates must already be registered.
- Story points or estimates, and scope-change tracking in the burndown.
- Live board updates over Socket.IO; another person's changes appear after a reload.
- Docs, time tracking, the AI agent and the Bitbucket integration, which are later sprints. Their screens still show sample data and are labelled as a preview.
