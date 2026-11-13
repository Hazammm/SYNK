"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight, ChevronLeft, ChevronRight, Plus, Timer, Download,
} from "lucide-react";
import { tickets, weekHours } from "@/mocks/data";
import { Button, Card } from "./Primitives";
import styles from "./Synk.module.css";

// Sample-data preview screen. Everything except time tracking is a live feature under src/features.
type ScreenName = "time";

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

export default function SynkScreen({ screen }: { screen: ScreenName }) {
  return <div className={styles.screen}>
    {screen === "time" && <Time />}
  </div>;
}
