"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ArrowRight, Check, CheckCheck,
  ChevronDown, ChevronLeft, ChevronRight, Clock3, Code2, FileText, Filter, GripVertical, Heading1,
  Link2, List, MessageCircle, MoreHorizontal, Plus, Send,
  Sparkles, Timer, X, Zap, Download,
} from "lucide-react";
import { activity, members, notifications, tickets, weekHours, type ThemeName, type Ticket, type TicketStatus } from "@/mocks/data";
import { Avatar, Badge, Button, Card, Input } from "./Primitives";
import { applyTheme } from "@/lib/theme";
import styles from "./Synk.module.css";

type ScreenName = "overview" | "alerts" | "board" | "backlog" | "reports" | "docs" | "time" | "settings";

const statuses: TicketStatus[] = ["To do", "In progress", "In review", "Done"];
const toneFor = (value: string): "neutral" | "done" | "medium" | "high" | "action" =>
  value === "Done" || value === "Low" ? "done" : value === "High" ? "high" : value === "Medium" ? "medium" : value === "In progress" ? "action" : "neutral";

function PageHeader({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: React.ReactNode }) {
  return <div className={styles.pageHeader}><div>{eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}<h1>{title}</h1></div><div className={styles.headerActions}>{children}</div></div>;
}

function downloadCsv(filename: string, rows: string[][]) {
  const contents = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Overview() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleTicket = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return <>
    <PageHeader title="FYP Synk" eyebrow="MONDAY, OCTOBER 12, 2025"><span className={styles.sprintPill}><span /> Sprint 3 · 8 days left</span><Button onClick={() => router.push("/docs")}><FileText size={16} /> New doc</Button><Button variant="primary" onClick={() => router.push("/board")}><Plus size={16} /> Ticket</Button></PageHeader>
    <div className={styles.stats}>
      {[["Open tickets", "12", "3 due this week"], ["Done", "28", "+6 this sprint"], ["Hours this week", "25.3", "of 40h target"], ["Days left", "8", "Sprint ends Oct 20"]].map(([label, value, foot], index) => <Card className={styles.statCard} key={label}><span className={styles.statIcon}>{[<KanbanMini key="a" />, <CheckCheck key="b" />, <Clock3 key="c" />, <Zap key="d" />][index]}</span><span className={styles.statLabel}>{label}</span><strong>{value}</strong><small>{foot}</small></Card>)}
    </div>
    <Card className={styles.sprintCard}><div className={styles.sectionTop}><div><span className={styles.eyebrow}>SPRINT 3</span><h2>Sprint progress</h2></div><span className={styles.progressCaption}>28 of 40 tickets completed <strong>70%</strong></span></div><div className={styles.progress}><span style={{ width: "70%" }} /></div><div className={styles.sprintMeta}><span>Oct 6 – Oct 20</span><span>12 tickets remaining</span></div></Card>
    <div className={styles.twoColumns}>
      <Card><div className={styles.sectionTop}><div><h2>My tickets</h2><p className={styles.subtle}>Your assigned work this sprint</p></div><button className={styles.textButton} type="button">View all <ArrowRight size={14} /></button></div><div className={styles.ticketList}>{tickets.slice(0, 4).map((ticket) => <div className={styles.myTicket} key={ticket.id}><button className={`${styles.taskCheck} ${selected.has(ticket.id) ? styles.taskChecked : ""}`} onClick={() => toggleTicket(ticket.id)} type="button" aria-label={`Mark ${ticket.id} complete`}>{selected.has(ticket.id) && <Check size={13} />}</button><div className={styles.myTicketBody}><div><span className={styles.ticketId}>{ticket.id}</span><Badge tone={toneFor(ticket.priority)}>{ticket.priority}</Badge></div><strong>{ticket.title}</strong><small>{ticket.completedSubtasks}/{ticket.subtasks} subtasks · {ticket.status}</small></div><Avatar initials={ticket.assignee.initials} small /></div>)}</div></Card>
      <Card><div className={styles.sectionTop}><div><h2>Recent activity</h2><p className={styles.subtle}>What’s happening in your project</p></div><button className={styles.iconButton} aria-label="Activity options" type="button"><MoreHorizontal size={18} /></button></div><div className={styles.activityList}>{activity.map((item) => <div className={styles.activityItem} key={item.target}><Avatar initials={item.initials} small /><div><p><strong>{item.name}</strong> {item.action} <a href="/board">{item.target}</a></p><small>{item.time}</small></div></div>)}</div></Card>
    </div>
  </>;
}

function KanbanMini() { return <span className={styles.kanbanMini}><i /><i /><i /></span>; }

function Alerts() {
  const [filter, setFilter] = useState("All");
  const [read, setRead] = useState<number[]>([]);
  const filters = ["All", "Mentions", "Tickets", "Docs"];
  const shown = notifications.filter((item) => filter === "All" || item.kind === filter.slice(0, -1) || (filter === "Mentions" && item.kind === "Mention"));
  return <>
    <PageHeader title="Alerts"><Button onClick={() => setRead(notifications.map((item) => item.id))}><CheckCheck size={16} /> Mark all as read</Button></PageHeader>
    <Card><div className={styles.filterRow}>{filters.map((item) => <button key={item} className={`${styles.filterChip} ${filter === item ? styles.filterActive : ""}`} onClick={() => setFilter(item)} type="button">{item}{item === "All" && <span>4</span>}</button>)}</div>
      <div className={styles.alertList}>{shown.map((item) => <article className={`${styles.alertItem} ${item.unread && !read.includes(item.id) ? styles.alertUnread : ""}`} key={item.id}><span className={`${styles.alertIcon} ${item.kind === "Mention" ? styles.mentionIcon : item.kind === "Ticket" ? styles.ticketIcon : styles.docIcon}`}>{item.kind === "Mention" ? <MessageCircle size={17} /> : item.kind === "Ticket" ? <CheckCheck size={17} /> : <FileText size={17} />}</span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.time}</small></div>{item.unread && !read.includes(item.id) && <span className={styles.unreadDot} aria-label="Unread" />}</article>)}</div></Card>
    <Card className={styles.preferences}><div><h2>Notification preferences</h2><p className={styles.subtle}>Choose what you’d like to hear about</p></div>{["Mentions and replies", "Ticket updates", "Document activity", "Weekly project summary"].map((item, index) => <label className={styles.preferenceRow} key={item}><span><strong>{item}</strong><small>{["When someone mentions you or replies", "Changes to tickets assigned to you", "Comments and edits on linked docs", "A summary sent every Monday"][index]}</small></span><input type="checkbox" defaultChecked={index < 3} /></label>)}</Card>
  </>;
}

function DraggableTicket({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id, data: { status: ticket.status } });
  return <article ref={setNodeRef} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined} className={`${styles.boardTicket} ${isDragging ? styles.dragging : ""}`}>
    <div className={styles.boardTicketTop}><button className={styles.dragHandle} type="button" aria-label={`Drag ${ticket.id}`} {...listeners} {...attributes} aria-describedby="ticket-drag-instructions"><GripVertical size={14} /></button><span className={styles.ticketId}>{ticket.id}</span><button className={styles.cardMore} type="button" aria-label={`Open ${ticket.id}`} onClick={onClick}><MoreHorizontal size={16} /></button></div>
    <button className={styles.boardTicketTitle} type="button" onClick={onClick}>{ticket.title}</button>
    <div className={styles.boardTicketMeta}><Badge tone={toneFor(ticket.priority)}>{ticket.priority}</Badge><span><CheckCheck size={13} /> {ticket.completedSubtasks}/{ticket.subtasks}</span><Avatar initials={ticket.assignee.initials} small /></div>
  </article>;
}

function BoardColumn({ status, items, onSelect }: { status: TicketStatus; items: Ticket[]; onSelect: (ticket: Ticket) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return <div ref={setNodeRef} className={`${styles.boardColumn} ${isOver ? styles.columnOver : ""}`}><div className={styles.columnTitle}><span className={`${styles.statusDot} ${styles[`dot${status.replace(" ", "")}`]}`} /><strong>{status}</strong><span>{items.length}</span><button type="button" aria-label={`Add to ${status}`}><Plus size={15} /></button></div><div className={styles.columnCards}>{items.map((ticket) => <DraggableTicket key={ticket.id} ticket={ticket} onClick={() => onSelect(ticket)} />)}</div></div>;
}

function TicketDrawer({ ticket, onClose, onComplete }: { ticket: Ticket; onClose: () => void; onComplete: () => void }) {
  const [checked, setChecked] = useState([true, true, ...Array(Math.max(0, ticket.subtasks - 2)).fill(false)]);
  const [running, setRunning] = useState(false);
  return <div className={styles.drawerBackdrop} onClick={onClose}><aside className={styles.ticketDrawer} onClick={(event) => event.stopPropagation()}><div className={styles.drawerTop}><span className={styles.ticketId}>{ticket.id}</span><button className={styles.iconButton} onClick={onClose} type="button" aria-label="Close ticket"><X size={18} /></button></div><input className={styles.drawerTitle} defaultValue={ticket.title} aria-label="Ticket title" /><div className={styles.drawerBadges}><Badge tone={toneFor(ticket.status)}>{ticket.status} <ChevronDown size={12} /></Badge><Badge tone={toneFor(ticket.priority)}>{ticket.priority} priority <ChevronDown size={12} /></Badge></div><p className={styles.drawerDescription}>{ticket.description}</p><div className={styles.drawerSection}><h3>Assignee</h3><div className={styles.drawerAssignee}><Avatar initials={ticket.assignee.initials} small /> {ticket.assignee.name}<ChevronDown size={14} /></div></div><div className={styles.drawerSection}><div className={styles.sectionTop}><h3>Subtasks</h3><span>{checked.filter(Boolean).length}/{checked.length}</span></div>{["Create login form", "Add validation states", "Connect university SSO", "Test responsive layout"].slice(0, ticket.subtasks).map((label, index) => <label className={styles.subtask} key={label}><input type="checkbox" checked={Boolean(checked[index])} onChange={() => setChecked((current) => current.map((value, i) => i === index ? !value : value))} /><span>{label}</span></label>)}</div><a href="/chat" className={styles.linkedChat}><MessageCircle size={16} /><span><strong>#design</strong><small>3 messages linked</small></span><ArrowRight size={14} /></a><Button variant={running ? "primary" : "secondary"} onClick={() => setRunning(!running)}><Timer size={16} /> {running ? "Timer running · Stop" : "Start timer"}</Button><div className={styles.drawerComments}><h3>Comments</h3><div className={styles.comment}><Avatar initials="MC" small /><p><strong>Maya Chen</strong><span>Added the updated form states.</span></p></div><div className={styles.commentBox}><input placeholder="Write a comment..." /><button type="button" aria-label="Send comment"><Send size={15} /></button></div></div><Button variant="quiet" className={styles.closeTicket} onClick={onComplete}><Check size={16} /> Close</Button></aside></div>;
}

function Board() {
  const [items, setItems] = useState(tickets);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [priority, setPriority] = useState("All priorities");
  const [assignee, setAssignee] = useState("All assignees");
  function dragEnd(event: DragEndEvent) {
    const status = event.over?.id;
    if (!statuses.includes(status as TicketStatus)) return;
    setItems((current) => current.map((ticket) => ticket.id === event.active.id ? { ...ticket, status: status as TicketStatus } : ticket));
  }
  function addTicket() {
    setItems((current) => {
      const nextId = Math.max(...current.map((ticket) => Number(ticket.id.split("-")[1]))) + 1;
      return [...current, { ...tickets[0], id: `SYN-${nextId}`, title: "Untitled ticket", status: "To do", priority: "Medium", subtasks: 0, completedSubtasks: 0, points: 1 }];
    });
  }
  function completeTicket() {
    if (selected) setItems((current) => current.map((ticket) => ticket.id === selected.id ? { ...ticket, status: "Done" } : ticket));
    setSelected(null);
  }
  return <>
    <PageHeader title="Sprint 3" eyebrow="BOARD · OCT 6 – OCT 20"><div className={styles.selectWrap}><Filter size={14} /><select aria-label="Filter by assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option>All assignees</option>{members.map((member) => <option key={member.name}>{member.name}</option>)}</select></div><select className={styles.select} aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option>All priorities</option><option>High</option><option>Medium</option><option>Low</option></select><Button variant="primary" onClick={addTicket}><Plus size={16} /> Ticket</Button></PageHeader>
    <div className={styles.boardSubnav}><a className={styles.subnavActive} href="/board">Board</a><a href="/board/backlog">Backlog</a><a href="/board/reports">Reports</a><span className={styles.boardCounts}>40 tickets · 28 completed</span></div>
    <DndContext onDragEnd={dragEnd}><span id="ticket-drag-instructions" className={styles.srOnly}>Drag a ticket by its handle and drop it in another column to update its status.</span><div className={styles.board}>{statuses.map((status) => <BoardColumn key={status} status={status} items={items.filter((ticket) => ticket.status === status && (priority === "All priorities" || ticket.priority === priority) && (assignee === "All assignees" || ticket.assignee.name === assignee))} onSelect={setSelected} />)}</div></DndContext>
    {selected && <TicketDrawer key={selected.id} ticket={selected} onClose={() => setSelected(null)} onComplete={completeTicket} />}
  </>;
}

function Backlog() {
  const [groups, setGroups] = useState<Record<string, string[]>>({
    "Sprint 3 · Active": tickets.slice(0, 3).map((ticket) => ticket.id),
    "Sprint 4 · Planned": tickets.slice(3, 5).map((ticket) => ticket.id),
    "Backlog · Unscheduled": tickets.slice(5).map((ticket) => ticket.id),
  });
  const [collapsed, setCollapsed] = useState<string[]>([]);
  function dragEnd(event: DragEndEvent) {
    const destination = event.over?.id;
    if (typeof destination !== "string" || !(destination in groups)) return;
    const source = Object.keys(groups).find((group) => groups[group].includes(String(event.active.id)));
    if (!source || source === destination) return;
    setGroups((current) => ({ ...current, [source]: current[source].filter((id) => id !== event.active.id), [destination]: [...current[destination], String(event.active.id)] }));
  }
  return <>
    <PageHeader title="Backlog"><Button><CheckCheck size={16} /> Complete sprint</Button><Button variant="primary"><Zap size={16} /> Start sprint</Button></PageHeader>
    <div className={styles.boardSubnav}><a href="/board">Board</a><a className={styles.subnavActive} href="/board/backlog">Backlog</a><a href="/board/reports">Reports</a><span className={styles.boardCounts}>7 tickets</span></div>
    <DndContext onDragEnd={dragEnd}><span id="ticket-drag-instructions" className={styles.srOnly}>Drag a ticket by its handle and drop it into another sprint group.</span><div className={styles.backlogGroups}>{Object.entries(groups).map(([name, ids]) => <BacklogGroup key={name} name={name} ids={ids} collapsed={collapsed.includes(name)} onToggle={() => setCollapsed((current) => current.includes(name) ? current.filter((value) => value !== name) : [...current, name])} />)}</div></DndContext>
  </>;
}

function BacklogGroup({ name, ids, collapsed, onToggle }: { name: string; ids: string[]; collapsed: boolean; onToggle: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: name });
  return <section ref={setNodeRef} className={`${styles.backlogGroup} ${isOver ? styles.columnOver : ""}`}>
    <div className={styles.groupHeading}>
      <button type="button" className={styles.groupToggle} onClick={onToggle} aria-expanded={!collapsed}><ChevronDown size={16} className={collapsed ? styles.rotated : ""} /><strong>{name}</strong><span>{ids.length}</span></button>
      <button type="button" className={styles.iconButton} aria-label="Group options"><MoreHorizontal size={17} /></button>
    </div>
    {!collapsed && <div className={styles.backlogRows}>{ids.map((id) => {
      const ticket = tickets.find((item) => item.id === id);
      return ticket ? <BacklogRow key={id} ticket={ticket} /> : null;
    })}<button className={styles.addRow} type="button"><Plus size={15} /> Add ticket</button></div>}
  </section>;
}

function BacklogRow({ ticket }: { ticket: Ticket }) {
  const { setNodeRef, listeners, attributes, transform } = useDraggable({ id: ticket.id });
  return <div ref={setNodeRef} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined} className={styles.backlogRow}><button type="button" className={styles.dragHandle} aria-label={`Drag ${ticket.id}`} {...listeners} {...attributes} aria-describedby="ticket-drag-instructions"><GripVertical size={14} /></button><input type="checkbox" aria-label={`Select ${ticket.id}`} /><span className={styles.ticketId}>{ticket.id}</span><strong>{ticket.title}</strong><Badge tone={toneFor(ticket.status)}>{ticket.status}</Badge><Badge tone={toneFor(ticket.priority)}>{ticket.priority}</Badge><span className={styles.points}>{ticket.points} pts</span><Avatar initials={ticket.assignee.initials} small /></div>;
}

function Reports() {
  return <>
    <PageHeader title="Sprint reports"><div className={styles.selectWrap}><select aria-label="Choose sprint"><option>Sprint 3 · Oct 6–20</option><option>Sprint 2 · Sep 22–Oct 5</option></select><ChevronDown size={14} /></div><Button onClick={() => downloadCsv("synk-sprint-3.csv", [["Status", "Tickets"], ...statuses.map((status, index) => [status, String([6, 4, 2, 28][index])])])}><Download size={16} /> Export CSV</Button></PageHeader>
    <div className={styles.stats}>{[["Committed", "40", "tickets"], ["Completed", "28", "70% complete"], ["Added mid-sprint", "4", "tickets"], ["Velocity", "32", "story points"]].map(([label, value, foot]) => <Card className={styles.statCard} key={label}><span className={styles.statLabel}>{label}</span><strong>{value}</strong><small>{foot}</small></Card>)}</div>
    <div className={styles.reportGrid}><Card><div className={styles.sectionTop}><div><h2>Burndown</h2><p className={styles.subtle}>Remaining work over the sprint</p></div><div className={styles.chartLegend}><span><i /> Ideal</span><span><i /> Remaining</span></div></div><svg className={styles.chart} viewBox="0 0 560 210" role="img" aria-label="Burndown chart"><path className={styles.chartGrid} d="M40 20H550M40 65H550M40 110H550M40 155H550M40 200H550" /><path className={styles.idealLine} d="M40 28L550 190" /><path className={styles.remainingLine} d="M40 28L110 42L180 52L250 82L320 102L390 118L460 156L550 176" /><text x="40" y="207">Oct 6</text><text x="260" y="207">Oct 13</text><text x="510" y="207">Oct 20</text></svg></Card>
      <Card><div className={styles.sectionTop}><div><h2>Velocity</h2><p className={styles.subtle}>Story points completed</p></div></div><svg className={styles.chart} viewBox="0 0 380 210" role="img" aria-label="Velocity bar chart"><path className={styles.chartGrid} d="M30 40H370M30 90H370M30 140H370M30 190H370" /><rect className={styles.bar} x="65" y="78" width="45" height="112" rx="5" /><rect className={styles.bar} x="145" y="53" width="45" height="137" rx="5" /><rect className={styles.barActive} x="225" y="65" width="45" height="125" rx="5" /><rect className={styles.barFaint} x="305" y="38" width="45" height="152" rx="5" /><text x="65" y="207">Sprint 1</text><text x="145" y="207">Sprint 2</text><text x="225" y="207">Sprint 3</text><text x="305" y="207">Sprint 4</text></svg></Card>
      <Card><div className={styles.sectionTop}><div><h2>Tickets by status</h2><p className={styles.subtle}>Sprint 3 distribution</p></div></div><div className={styles.stackedBar}><span /><span /><span /><span /></div><div className={styles.statusLegend}>{statuses.map((status, index) => <span key={status}><i className={styles[`legend${index}`]} />{status}<strong>{[6, 4, 2, 28][index]}</strong></span>)}</div></Card></div>
  </>;
}

function Docs() {
  const [insertOpen, setInsertOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(false);
  const [resolved, setResolved] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  function insert(value: string) {
    editor.current?.focus();
    document.execCommand("insertText", false, value);
    setInsertOpen(false);
  }
  return <>
    <PageHeader title="Sprint 3 planning"><Button><MoreHorizontal size={16} /> Share</Button><Button variant="primary"><Check size={16} /> Publish</Button></PageHeader>
    <div className={styles.docsLayout}><aside className={styles.docTree}><div className={styles.treeHeading}>FYP SYNK <button type="button" aria-label="Add document"><Plus size={14} /></button></div><a href="#project"><FileText size={15} /> Project brief</a><a href="#sprint" className={styles.treeSelected}><FileText size={15} /> Sprint 3 planning</a><a href="#research"><FileText size={15} /> Research notes</a><button type="button"><Plus size={15} /> Add page</button></aside>
      <div className={styles.docEditor}><div className={styles.docToolbar}>{[[<strong key="b">B</strong>, "Bold"], [<em key="i">I</em>, "Italic"], [<Heading1 key="h" size={16} />, "Heading"], [<List key="l" size={16} />, "List"], [<Link2 key="link" size={16} />, "Link"], [<Code2 key="code" size={16} />, "Code"]].map(([icon, label]) => <button key={label as string} title={label as string} type="button" onClick={() => document.execCommand(label === "Bold" ? "bold" : label === "Italic" ? "italic" : label === "List" ? "insertUnorderedList" : "formatBlock", false, label === "Heading" ? "h2" : undefined)}>{icon}</button>)}<span className={styles.toolbarDivider} /><div className={styles.insertWrap}><button type="button" onClick={() => setInsertOpen(!insertOpen)}><Plus size={15} /> Insert</button>{insertOpen && <div className={styles.insertMenu}>{["Heading", "Ticket", "Table"].map((item) => <button key={item} type="button" onClick={() => insert(item === "Ticket" ? "SYN-12 · Login UI" : item === "Table" ? "Item | Owner | Status" : "New section")}>{item}</button>)}</div>}</div><span className={styles.saveState}><Check size={13} /> All changes saved</span></div>
        <article className={styles.document}><div className={styles.docMeta}>FYP SYNK <span>·</span> UPDATED 12 MIN AGO</div><h1>Sprint 3 planning</h1><p className={styles.docIntro}>Our focus for the next two weeks: ship a polished onboarding experience and lay the groundwork for our first beta release.</p><div ref={editor} contentEditable suppressContentEditableWarning className={styles.editable}><h2>Goals for this sprint</h2><ul><li>Complete the login and onboarding flow</li><li>Finalize dashboard UI and get team feedback</li><li>Document API requirements for the next milestone</li></ul><h2>Key tickets</h2><p>Tickets planned for this sprint, prioritized by impact and effort.</p></div><a href="/board" className={styles.docTicket}><span className={styles.ticketId}>SYN-12</span><strong>Login UI</strong><Badge tone="action">In progress</Badge><ArrowRight size={15} /></a><p className={styles.docHint}>Type <kbd>/</kbd> to insert blocks</p></article>
      </div>
      <aside className={styles.aiPanel}><div className={styles.aiTitle}><Sparkles size={17} /><strong>Ask Synk AI</strong><span className={styles.readOnly}>READ ONLY</span></div><div className={styles.aiChat}><div className={styles.aiUser}>What are this sprint’s main goals?</div><div className={styles.aiAnswer}>Sprint 3 has three main goals: complete the login and onboarding flow, finalize the dashboard UI, and document API requirements for the next milestone.<div className={styles.sourceChips}><a href="#sprint">Sprint 3 planning</a><a href="/board">SYN-12</a></div></div>{answer && <div className={styles.aiAnswer}>I found that in the current project docs. You can review the sprint notes above for more detail.</div>}</div><form className={styles.aiInput} onSubmit={(event) => { event.preventDefault(); if (question.trim()) setAnswer(true); setQuestion(""); }}><input placeholder="Ask about this doc..." value={question} onChange={(event) => setQuestion(event.target.value)} /><button type="submit" aria-label="Ask Synk AI"><Send size={15} /></button></form><div className={styles.commentSection}><div className={styles.sectionTop}><h3>Comments <span>{resolved ? 1 : 2}</span></h3><button type="button" className={styles.iconButton} aria-label="Comment options"><MoreHorizontal size={17} /></button></div><div className={styles.comment}><Avatar initials="JL" small /><p><strong>Jordan Lee <small>· 1h</small></strong><span>Great direction. Let’s make sure design review is on the calendar.</span><button type="button" className={styles.resolve} onClick={() => setResolved(!resolved)}>{resolved ? "Resolved" : "Resolve"}</button></p></div><div className={styles.comment}><Avatar initials="MC" small /><p><strong>Maya Chen <small>· 34m</small></strong><span>I’ve updated the ticket priorities to reflect this.</span></p></div></div></aside>
    </div>
  </>;
}

function Time() {
  const [seconds, setSeconds] = useState(42 * 60 + 12);
  const [running, setRunning] = useState(true);
  const [week, setWeek] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const time = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <>
    <PageHeader title="Time tracking"><Button onClick={() => downloadCsv("synk-timesheet.csv", [["Day", "Date", "Hours"], ...weekHours.map((day) => [day.day, day.date, String(day.hours)])])}><Download size={16} /> Export timesheet</Button></PageHeader>
    <Card className={styles.runningTimer}><div className={styles.timerPulse}><Timer size={19} /></div><div><span className={styles.eyebrow}>CURRENTLY TRACKING</span><strong>SYN-12 · Login UI</strong><small>FYP Synk · Started at 9:18 AM</small></div><output>{time}</output><Button variant="primary" onClick={() => setRunning(!running)}>{running ? "Stop" : "Resume"}</Button><Button onClick={() => setSeconds((current) => current + 1800)}><Plus size={15} /> Add time</Button></Card>
    <div className={styles.twoColumns}><Card><div className={styles.weekHeader}><div><h2>This week</h2><p className={styles.subtle}>Oct {12 + week * 7} – {18 + week * 7}, 2025</p></div><div><button className={styles.iconButton} type="button" onClick={() => setWeek(week - 1)} aria-label="Previous week"><ChevronLeft size={17} /></button><button className={styles.iconButton} type="button" onClick={() => setWeek(Math.min(0, week + 1))} aria-label="Next week"><ChevronRight size={17} /></button></div></div><div className={styles.weekTotal}><strong>25h 15m</strong><span>of 40h goal</span></div><div className={styles.weekRows}>{weekHours.map((day) => <div className={styles.weekRow} key={day.day}><span className={styles.weekDay}>{day.day}<small>{day.date}</small></span><div className={styles.weekBar}><span style={{ width: `${Math.min(100, day.hours / 8 * 100)}%` }} /></div><strong>{day.hours ? `${day.hours}h` : "—"}</strong></div>)}</div></Card>
      <Card><div className={styles.sectionTop}><div><h2>Time by project</h2><p className={styles.subtle}>This week · 25h 15m</p></div></div><div className={styles.donutWrap}><svg className={styles.donut} viewBox="0 0 140 140" role="img" aria-label="Time by project donut chart"><circle className={styles.donutTrack} cx="70" cy="70" r="54" /><circle className={styles.donutOne} cx="70" cy="70" r="54" /><circle className={styles.donutTwo} cx="70" cy="70" r="54" /><circle className={styles.donutThree} cx="70" cy="70" r="54" /><text x="70" y="66" textAnchor="middle">25.3h</text><text x="70" y="84" textAnchor="middle">TOTAL</text></svg><div className={styles.donutLegend}><p><i className={styles.donutColorOne} /><span>FYP Synk</span><strong>18h 30m</strong></p><p><i className={styles.donutColorTwo} /><span>Research</span><strong>4h 15m</strong></p><p><i className={styles.donutColorThree} /><span>Other</span><strong>2h 30m</strong></p></div></div></Card></div>
    <Card className={styles.byTicket}><div className={styles.sectionTop}><div><h2>Time by ticket</h2><p className={styles.subtle}>Your tracked work this week</p></div><button className={styles.textButton} type="button">View all <ArrowRight size={14} /></button></div>{tickets.slice(0, 4).map((ticket, index) => <div className={styles.timeTicket} key={ticket.id}><span className={styles.ticketId}>{ticket.id}</span><strong>{ticket.title}</strong><div className={styles.timeBar}><span style={{ width: `${[85, 55, 30, 16][index]}%` }} /></div><span>{["8h 20m", "5h 10m", "3h 45m", "2h 15m"][index]}</span></div>)}</Card>
  </>;
}

function Settings() {
  const [section, setSection] = useState("Profile");
  const [sent, setSent] = useState(false);
  const nav = ["Profile", "Appearance", "Notifications", "Members", "Account"];
  return <><PageHeader title="Settings" /><div className={styles.settingsLayout}><nav className={styles.settingsNav}>{nav.map((item) => <button type="button" onClick={() => setSection(item)} className={section === item ? styles.settingsActive : ""} key={item}>{item}</button>)}</nav><div className={styles.settingsBody}>
    {section === "Profile" && <Card><h2>Profile</h2><p className={styles.subtle}>Manage your personal information.</p><div className={styles.profileEdit}><Avatar initials="AR" /><button className={styles.textButton} type="button">Change photo</button></div><div className={styles.formGrid}><label className={styles.settingsField}>Full name<Input defaultValue="Alex Rivera" /></label><label className={styles.settingsField}>Workspace email<Input defaultValue="alex@workspace.com" type="email" /></label><label className={styles.settingsField}>Role<Input defaultValue="Frontend developer" /></label><label className={styles.settingsField}>Timezone<select className={styles.select}><option>Pacific Time (UTC−7)</option><option>Eastern Time (UTC−4)</option></select></label></div><Button variant="primary">Save changes</Button></Card>}
    {section === "Appearance" && <Card><h2>Appearance</h2><p className={styles.subtle}>Choose how Synk looks on this device.</p><div className={styles.themeCards}>{(["black", "white", "forest", "lavender"] as ThemeName[]).map((theme) => <button type="button" data-swatch={theme} key={theme} className={styles.themeCard} onClick={() => applyTheme(theme)}><span className={styles.themePreview}><i /><i /><i /></span><strong>{theme[0].toUpperCase() + theme.slice(1)}</strong></button>)}</div></Card>}
    {section === "Notifications" && <Card><h2>Notifications</h2><p className={styles.subtle}>Choose what you’d like to hear about.</p>{["Mentions and replies", "Ticket assignments", "Due date reminders", "Document updates", "Weekly summary"].map((item) => <label className={styles.preferenceRow} key={item}><span><strong>{item}</strong><small>Get notified about {item.toLowerCase()}</small></span><input type="checkbox" defaultChecked /></label>)}</Card>}
    {section === "Members" && <Card><h2>Members</h2><p className={styles.subtle}>Invite your teammates to FYP Synk.</p><form className={styles.inviteForm} onSubmit={(event) => { event.preventDefault(); setSent(true); }}><Input type="email" placeholder="teammate@workspace.com" required /><select className={styles.select}><option>Member</option><option>Admin</option><option>Guest</option></select><Button variant="primary">Invite</Button></form>{sent && <p className={styles.successNote}>Invitation sent to your teammate.</p>}{members.map((member) => <div className={styles.memberRow} key={member.name}><Avatar initials={member.initials} small /><span><strong>{member.name}</strong><small>{member.role}</small></span><Badge>{member.role}</Badge></div>)}</Card>}
    {section === "Account" && <Card><h2>Account</h2><p className={styles.subtle}>Manage your account preferences.</p><div className={styles.preferenceRow}><span><strong>Sign out</strong><small>You can sign back in at any time.</small></span><button onClick={() => void signOut({ callbackUrl: "/login" })} className={styles.logout}>Log out</button></div></Card>}
  </div></div></>;
}

export default function SynkScreen({ screen }: { screen: ScreenName }) {
  return <div className={styles.screen}>
    {screen === "overview" && <Overview />}
    {screen === "alerts" && <Alerts />}
    {screen === "board" && <Board />}
    {screen === "backlog" && <Backlog />}
    {screen === "reports" && <Reports />}
    {screen === "docs" && <Docs />}
    {screen === "time" && <Time />}
    {screen === "settings" && <Settings />}
  </div>;
}
