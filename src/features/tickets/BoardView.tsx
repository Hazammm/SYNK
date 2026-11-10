"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { CalendarDays, GripVertical, MessageSquare, Plus, Settings2, X } from "lucide-react";
import { Avatar, Badge, Button } from "@/components/Primitives";
import type { BoardSummary, ColumnSummary, ProjectDetail, TicketSummary } from "@/lib/ticket-types";
import { messageOf, request } from "@/lib/client-http";
import BoardSettings from "./BoardSettings";
import TicketDrawer, { type DrawerTarget } from "./TicketDrawer";
import { formatDate, initials, localToday, PRIORITIES, priorityOf, syncUrl, type Selection } from "./ui";
import styles from "./Tracker.module.css";

type Props = { project: ProjectDetail; userId: string; initial: Selection; onProjectChange: () => void };
type Filters = { assigneeId: string; priority: string; columnId: string; sprintId: string };
const NO_FILTERS: Filters = { assigneeId: "", priority: "", columnId: "", sprintId: "" };
const byPosition = (a: TicketSummary, b: TicketSummary) => a.position - b.position || (a.key < b.key ? -1 : 1);
const COLUMN_STEP = 292; // column width + gap in Tracker.module.css; one arrow key press moves one column

export default function BoardView({ project, userId, initial, onProjectChange }: Props) {
  const [boardId, setBoardId] = useState(project.boards.find(board => board.id === initial.boardId)?.id ?? project.boards[0]?.id ?? "");
  const [panel, setPanel] = useState<"settings" | "new" | null>(null);
  const board = project.boards.find(item => item.id === boardId) ?? project.boards[0];
  const canWrite = project.level === "WRITE";
  useEffect(() => { syncUrl({ boardId: board?.id }); }, [board?.id]);

  const boardPicker = <>
    <label className={styles.picker}>Board<select value={board?.id ?? ""} onChange={event => setBoardId(event.target.value)}>
      {project.boards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    {canWrite && board && <Button onClick={() => setPanel("settings")}><Settings2 size={15} /> Board settings</Button>}
    {canWrite && <Button onClick={() => setPanel("new")}><Plus size={15} /> New board</Button>}
  </>;
  return <>
    {board
      // Remounting per board resets tickets, filters and any open ticket.
      ? <Board key={board.id} project={project} board={board} userId={userId} canWrite={canWrite} initialTicket={board.id === initial.boardId || !initial.boardId ? initial.ticket : undefined} toolbar={boardPicker} />
      : <div className={styles.toolbar}>{boardPicker}</div>}
    {panel && <BoardSettings project={project} board={panel === "settings" ? board : undefined} onClose={() => setPanel(null)}
      onSaved={saved => { setPanel(null); setBoardId(saved.id); onProjectChange(); }} />}
  </>;
}

// Prefer the ticket under the pointer (insert before it); otherwise the column (append).
const collisionDetection: CollisionDetection = args => {
  const pointer = pointerWithin(args);
  const hits = pointer.length ? pointer : rectIntersection(args); // keyboard drags have no pointer
  const ticket = hits.find(hit => String(hit.id).startsWith("ticket:"));
  return ticket ? [ticket] : hits.filter(hit => String(hit.id).startsWith("column:"));
};
const coordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates: { x, y } }) => {
  switch (event.code) {
    case "ArrowRight": return { x: x + COLUMN_STEP, y };
    case "ArrowLeft": return { x: x - COLUMN_STEP, y };
    case "ArrowDown": return { x, y: y + 70 };
    case "ArrowUp": return { x, y: y - 70 };
    default: return undefined;
  }
};

function Board({ project, board, userId, canWrite, initialTicket, toolbar }: { project: ProjectDetail; board: BoardSummary; userId: string; canWrite: boolean; initialTicket?: string; toolbar: React.ReactNode }) {
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(initialTicket ? { ticketId: initialTicket } : null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [today] = useState(localToday);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a plain click still opens the ticket
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), // long-press, so the board still scrolls
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  useEffect(() => {
    const controller = new AbortController();
    request<{ tickets: TicketSummary[] }>(`/api/tickets?boardId=${board.id}`, { signal: controller.signal })
      .then(result => { setTickets(result.tickets); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [board.id, revision]);

  const visible = useMemo(() => (tickets ?? []).filter(ticket =>
    (!filters.priority || ticket.priority === filters.priority)
    && (!filters.assigneeId || (filters.assigneeId === "none" ? !ticket.assignee : ticket.assignee?.id === filters.assigneeId))
    && (!filters.sprintId || (filters.sprintId === "none" ? !ticket.sprintId : ticket.sprintId === filters.sprintId))), [tickets, filters]);
  const columns = board.columns.filter(column => !filters.columnId || column.id === filters.columnId);
  const filtered = Object.values(filters).some(Boolean);
  const shown = visible.filter(ticket => columns.some(column => column.id === ticket.columnId)).length;
  const dragging = tickets?.find(ticket => ticket.id === draggingId);
  const describe = (id: unknown) => {
    const [kind, value] = String(id).split(":");
    const ticket = tickets?.find(item => item.id === (kind === "ticket" ? value : id));
    return ticket ? `ticket ${ticket.key}` : `column ${board.columns.find(column => column.id === value)?.name ?? ""}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) => over ? `${describe(active.id)} is over ${describe(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) => over ? `Dropped ${describe(active.id)} on ${describe(over.id)}.` : `${describe(active.id)} was put back.`,
    onDragCancel: ({ active }) => `Move cancelled. ${describe(active.id)} was put back.`,
  };

  function openTicket(target: DrawerTarget | null) {
    setDrawer(target);
    syncUrl({ ticket: target && "ticketId" in target ? target.ticketId : undefined });
  }
  const upsert = (ticket: TicketSummary) => setTickets(current => current && (current.some(item => item.id === ticket.id) ? current.map(item => item.id === ticket.id ? ticket : item) : [...current, ticket]));

  async function dragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const ticketId = String(event.active.id);
    const [kind, overId] = String(event.over?.id ?? "").split(":");
    if (!tickets || !overId) return;
    const moving = tickets.find(ticket => ticket.id === ticketId)!;
    const columnId = kind === "ticket" ? tickets.find(ticket => ticket.id === overId)?.columnId : overId;
    if (!columnId || overId === ticketId) return;
    // The index counts every ticket in the column, including ones hidden by filters.
    const others = tickets.filter(ticket => ticket.columnId === columnId && ticket.id !== ticketId).sort(byPosition);
    const index = kind === "ticket" ? others.findIndex(ticket => ticket.id === overId) : others.length;
    const current = tickets.filter(ticket => ticket.columnId === moving.columnId).sort(byPosition).findIndex(ticket => ticket.id === ticketId);
    if (columnId === moving.columnId && index === current) return;
    others.splice(index, 0, { ...moving, columnId });
    const placed = new Map(others.map((ticket, position) => [ticket.id, { ...ticket, position }]));
    setTickets(tickets.map(ticket => placed.get(ticket.id) ?? ticket)); // optimistic; the server confirms below
    try {
      await request(`/api/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ columnId, position: index }) });
      setError("");
    } catch (error) {
      setError(`${moving.key} could not be moved: ${messageOf(error)}`);
      setRevision(value => value + 1); // reload the true order
    }
  }

  const select = (name: keyof Filters, label: string, options: { value: string; label: string }[]) =>
    <label className={styles.filter}><span className={styles.srOnly}>Filter by {label.toLowerCase()}</span>
      <select value={filters[name]} onChange={event => setFilters({ ...filters, [name]: event.target.value })} data-active={Boolean(filters[name])}>
        <option value="">{label}: all</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>;

  return <>
    <div className={styles.toolbar}>
      {toolbar}
      {canWrite && <Button variant="primary" className={styles.pushRight} onClick={() => openTicket({ columnId: board.columns[0].id })}><Plus size={15} /> New ticket</Button>}
    </div>
    <div className={styles.toolbar} role="group" aria-label="Ticket filters">
      {select("assigneeId", "Assignee", [{ value: "none", label: "Unassigned" }, ...project.members.map(member => ({ value: member.id, label: member.id === userId ? `${member.name ?? "Member"} (you)` : member.name ?? "Member" }))])}
      {select("priority", "Priority", PRIORITIES.map(({ value, label }) => ({ value, label })))}
      {select("columnId", "Status", board.columns.map(column => ({ value: column.id, label: column.name })))}
      {select("sprintId", "Sprint", [{ value: "none", label: "No sprint (backlog)" }, ...project.sprints.map(sprint => ({ value: sprint.id, label: sprint.state === "COMPLETED" ? `${sprint.name} (completed)` : sprint.name }))])}
      {filtered && <Button variant="quiet" onClick={() => setFilters(NO_FILTERS)}><X size={14} /> Clear filters</Button>}
      <span className={styles.count} role="status">{tickets ? (filtered ? `${shown} of ${tickets.length} tickets` : `${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"}`) : "Loading tickets…"}</span>
    </div>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Reload board</button></p>}
    {!canWrite && <p className={styles.notice}>You have view-only access to this project. Ask a workspace admin for edit access to create or move tickets.</p>}
    <DndContext sensors={sensors} collisionDetection={collisionDetection} accessibility={{ announcements, screenReaderInstructions: { draggable: "Press Space to pick up this ticket. Use the arrow keys to move between columns and tickets, Space to drop it, or Escape to cancel." } }}
      onDragStart={event => setDraggingId(String(event.active.id))} onDragCancel={() => setDraggingId(null)} onDragEnd={event => void dragEnd(event)}>
      <div className={styles.board}>
        {columns.map(column => <Column key={column.id} column={column} canWrite={canWrite} loading={!tickets}
          tickets={visible.filter(ticket => ticket.columnId === column.id).sort(byPosition)} hidden={filtered ? (tickets ?? []).filter(ticket => ticket.columnId === column.id).length : 0}
          today={today} onOpen={ticketId => openTicket({ ticketId })} onAdd={() => openTicket({ columnId: column.id })} />)}
      </div>
      <DragOverlay>{dragging && <TicketCard ticket={dragging} overdue={false} overlay />}</DragOverlay>
    </DndContext>
    {drawer && <TicketDrawer key={"ticketId" in drawer ? drawer.ticketId : `new:${drawer.columnId}`} target={drawer} project={project} board={board} userId={userId} canWrite={canWrite}
      onClose={() => openTicket(null)} onSaved={upsert} onCreated={ticket => { upsert(ticket); openTicket(null); }} />}
  </>;
}

function Column({ column, tickets, hidden, canWrite, loading, today, onOpen, onAdd }: { column: ColumnSummary; tickets: TicketSummary[]; hidden: number; canWrite: boolean; loading: boolean; today: string; onOpen: (ticketId: string) => void; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });
  return <section ref={setNodeRef} className={styles.column} data-over={isOver} aria-label={`${column.name}, ${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"}`}>
    <header className={styles.columnHead}>
      <i className={styles.dot} data-done={column.isDone} aria-hidden="true" /><h2>{column.name}</h2><span aria-hidden="true">{tickets.length}</span>
      {canWrite && <button type="button" aria-label={`Add a ticket to ${column.name}`} onClick={onAdd}><Plus size={16} /></button>}
    </header>
    <div className={styles.cards}>
      {tickets.map(ticket => <DraggableTicket key={ticket.id} ticket={ticket} disabled={!canWrite} overdue={Boolean(ticket.dueDate && ticket.dueDate < today && !column.isDone)} onOpen={() => onOpen(ticket.id)} />)}
      {!loading && !tickets.length && <p className={styles.columnEmpty}>{hidden ? "No tickets match the filters." : canWrite ? "Drop a ticket here." : "No tickets."}</p>}
    </div>
  </section>;
}

function DraggableTicket({ ticket, disabled, overdue, onOpen }: { ticket: TicketSummary; disabled: boolean; overdue: boolean; onOpen: () => void }) {
  const { setNodeRef: setDragNode, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({ id: ticket.id, disabled });
  const { setNodeRef: setDropNode, isOver } = useDroppable({ id: `ticket:${ticket.id}`, disabled });
  // The whole card can be dragged with a mouse or a long-press; the handle is the keyboard control.
  return <div ref={node => { setDragNode(node); setDropNode(node); }} {...listeners} className={styles.cardSlot} data-dragging={isDragging} data-over={isOver && !isDragging}>
    <TicketCard ticket={ticket} overdue={overdue} onOpen={onOpen}
      handle={!disabled && <button type="button" ref={setActivatorNodeRef} {...attributes} className={styles.handle} aria-label={`Move ${ticket.key}: ${ticket.title}`}><GripVertical size={15} /></button>} />
  </div>;
}

function TicketCard({ ticket, overdue, overlay, handle, onOpen }: { ticket: TicketSummary; overdue: boolean; overlay?: boolean; handle?: React.ReactNode; onOpen?: () => void }) {
  const priority = priorityOf(ticket.priority);
  return <article className={styles.card} data-overlay={overlay}>
    <div className={styles.cardTop}>{handle}<span className={styles.key}>{ticket.key}</span><Badge tone={priority.tone}>{priority.label}</Badge></div>
    <button type="button" className={styles.cardTitle} onClick={onOpen} tabIndex={overlay ? -1 : undefined}>{ticket.title}</button>
    <div className={styles.cardMeta}>
      {ticket.dueDate && <span data-overdue={overdue}><CalendarDays size={13} aria-hidden="true" /> {overdue && <span className={styles.srOnly}>Overdue, </span>}Due {formatDate(ticket.dueDate)}</span>}
      {ticket.commentCount > 0 && <span><MessageSquare size={13} aria-hidden="true" /> {ticket.commentCount}<span className={styles.srOnly}> {ticket.commentCount === 1 ? "comment" : "comments"}</span></span>}
      {ticket.assignee
        ? <span className={styles.pushRight} title={`Assigned to ${ticket.assignee.name ?? "Member"}`}><span className={styles.srOnly}>Assigned to {ticket.assignee.name ?? "Member"}</span><Avatar small initials={initials(ticket.assignee.name)} /></span>
        : <span className={`${styles.pushRight} ${styles.unassigned}`}>Unassigned</span>}
    </div>
  </article>;
}
