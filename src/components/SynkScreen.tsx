"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  ArrowRight, Check, ChevronLeft, ChevronRight, Code2, FileText, Heading1,
  Link2, List, MoreHorizontal, Plus, Send, Sparkles, Timer, Download,
} from "lucide-react";
import { members, tickets, weekHours, type ThemeName } from "@/mocks/data";
import { Avatar, Badge, Button, Card, Input } from "./Primitives";
import { applyTheme } from "@/lib/theme";
import styles from "./Synk.module.css";

// Sample-data preview screens. Overview, board, sprints, reports and alerts are live features under src/features.
type ScreenName = "docs" | "time" | "settings";

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
    {screen === "docs" && <Docs />}
    {screen === "time" && <Time />}
    {screen === "settings" && <Settings />}
  </div>;
}
