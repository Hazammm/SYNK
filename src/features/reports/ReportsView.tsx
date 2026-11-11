"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { Badge, Button } from "@/components/Primitives";
import type { ProjectDetail } from "@/lib/ticket-types";
import type { BurndownPoint, ProjectReport, SprintReport, VelocityEntry } from "@/lib/report-types";
import { messageOf, request } from "@/lib/client-http";
import { formatDate, formatDateTime, localToday, priorityOf, syncUrl, trackerHref } from "../tickets/ui";
import { percent } from "./calc";
import { downloadCsv, fileSafe } from "./download";
import styles from "../tickets/Tracker.module.css";

const STATE_LABEL = { ACTIVE: "Active", PLANNED: "Planned", COMPLETED: "Completed" };
const DAY_MS = 86_400_000;

export default function ReportsView({ project, initialSprintId }: { project: ProjectDetail; initialSprintId?: string }) {
  const [sprintId, setSprintId] = useState(initialSprintId ?? "");
  const [data, setData] = useState<ProjectReport | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<ProjectReport>(`/api/projects/${project.id}/reports${sprintId ? `?sprintId=${sprintId}` : ""}`, { signal: controller.signal })
      .then(result => { setData(result); setError(""); })
      .catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [project.id, sprintId, revision]);

  const choose = (id: string) => { setSprintId(id); syncUrl({ sprintId: id || undefined }); };
  const report = data?.report;
  const sprintsHref = trackerHref("sprints", { workspaceId: project.workspaceId, projectId: project.id });

  if (error) return <p role="alert" className={styles.error}>{error}{" "}
    <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button>
    {sprintId && <button type="button" onClick={() => choose("")}>Show the current sprint</button>}
  </p>;
  if (!data) return <p role="status" className={styles.loading}>Loading the sprint report…</p>;
  if (!report) return <div className={styles.empty}><BarChart3 size={32} /><h2>No sprints to report on yet</h2>
    <p>Create a sprint and add tickets to it. Its burndown and progress appear here as work gets done.</p>
    <Link href={sprintsHref}>Go to sprints</Link></div>;

  const exportCsv = () => downloadCsv(`synk-${fileSafe(project.key)}-${fileSafe(report.sprint.name)}.csv`, [
    ["Key", "Title", "Status", "Priority", "Assignee", "Completed"],
    ...report.tickets.map(ticket => [ticket.key, ticket.title, ticket.status, priorityOf(ticket.priority).label, ticket.assignee?.name ?? "Unassigned", ticket.completedAt?.slice(0, 10) ?? ""]),
  ]);

  return <>
    <div className={styles.toolbar}>
      <label className={styles.picker}>Sprint<select value={report.sprint.id} onChange={event => choose(event.target.value)}>
        {data.sprints.map(sprint => <option key={sprint.id} value={sprint.id}>{sprint.name} ({STATE_LABEL[sprint.state].toLowerCase()})</option>)}
      </select></label>
      <span className={styles.summary}><Badge tone={report.sprint.state === "ACTIVE" ? "action" : report.sprint.state === "COMPLETED" ? "done" : "neutral"}>{STATE_LABEL[report.sprint.state]}</Badge> {formatDate(report.sprint.startDate)} – {formatDate(report.sprint.endDate)}</span>
      <Button className={styles.pushRight} onClick={exportCsv} disabled={!report.tickets.length}><Download size={15} /> Export CSV</Button>
    </div>
    <div className={styles.report}>
      {report.sprint.goal && <p className={styles.goal}><strong>Sprint goal:</strong> {report.sprint.goal}</p>}
      <Stats report={report} />
      <div className={styles.reportGrid}>
        <section className={styles.chartCard} aria-labelledby="burndown-title">
          <h2 id="burndown-title">Burndown</h2><p>Tickets left at the end of each day</p>
          <Burndown points={report.burndown} total={report.totals.total} />
        </section>
        <section className={styles.chartCard} aria-labelledby="velocity-title">
          <h2 id="velocity-title">Velocity</h2><p>Tickets finished in each completed sprint</p>
          <Velocity entries={data.velocity} />
        </section>
      </div>
      <div className={styles.reportGrid}>
        <section className={styles.chartCard} aria-labelledby="sprint-tickets-title">
          <h2 id="sprint-tickets-title">Tickets in this sprint</h2>
          {report.totals.carriedOver > 0 && <p>{report.totals.carriedOver} unfinished {report.totals.carriedOver === 1 ? "ticket" : "tickets"} returned to the backlog when the sprint was completed.</p>}
          {report.tickets.length ? <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th scope="col">Key</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Priority</th><th scope="col">Assignee</th><th scope="col">Completed</th></tr></thead>
            <tbody>{report.tickets.map(ticket => <tr key={ticket.id}>
              <td className={styles.key}>{ticket.key}</td>
              <td><Link href={trackerHref("board", { workspaceId: project.workspaceId, projectId: project.id, ticket: ticket.id })}>{ticket.title}</Link></td>
              <td><Badge tone={ticket.done ? "done" : "neutral"}>{ticket.status}</Badge></td>
              <td>{priorityOf(ticket.priority).label}</td>
              <td>{ticket.assignee?.name ?? "Unassigned"}</td>
              <td>{ticket.completedAt ? formatDateTime(ticket.completedAt) : "—"}</td>
            </tr>)}</tbody>
          </table></div> : <p>No tickets are in this sprint.</p>}
        </section>
        <section className={styles.chartCard} aria-labelledby="breakdown-title">
          <h2 id="breakdown-title">By status</h2>
          <Breakdown rows={report.byStatus.map(row => ({ label: row.name, value: row.count, done: row.done }))} total={report.tickets.length} />
          <h2>By assignee</h2>
          <Breakdown rows={report.byAssignee.map(row => ({ label: row.assignee ? row.assignee.name ?? "Member" : "Unassigned", value: row.total, note: `${row.completed} done` }))} total={report.tickets.length} />
        </section>
      </div>
    </div>
  </>;
}

function Stats({ report }: { report: SprintReport }) {
  const { total, completed, remaining, carriedOver } = report.totals;
  const daysLeft = Math.max(0, Math.round((Date.parse(report.sprint.endDate) - Date.parse(localToday())) / DAY_MS) + 1);
  const last = report.sprint.state === "COMPLETED" ? ["Carried over", String(carriedOver), "returned to the backlog"]
    : report.sprint.state === "ACTIVE" ? ["Days left", String(daysLeft), `ends ${formatDate(report.sprint.endDate)}`]
      : ["Starts", formatDate(report.sprint.startDate), "not started yet"];
  const tiles = [
    ["Committed", String(total), total === 1 ? "ticket" : "tickets"],
    ["Completed", String(completed), `${percent(completed, total)}% of the sprint`],
    ["Remaining", String(remaining), remaining === 1 ? "ticket to go" : "tickets to go"],
    last,
  ];
  return <dl className={styles.stats}>{tiles.map(([label, value, note]) => <div className={styles.stat} key={label}><dt>{label}</dt><dd><strong>{value}</strong><small>{note}</small></dd></div>)}</dl>;
}

function Burndown({ points, total }: { points: BurndownPoint[]; total: number }) {
  const [active, setActive] = useState<number | null>(null);
  if (!points.length) return <p>This sprint has no valid dates to chart.</p>;
  const W = 640, H = 240, left = 36, right = 20, top = 14, bottom = 30;
  const plotW = W - left - right, plotH = H - top - bottom, max = Math.max(total, 1);
  const x = (index: number) => left + (points.length > 1 ? index / (points.length - 1) : 0.5) * plotW;
  const y = (value: number) => top + (1 - value / max) * plotH;
  const line = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const actual = points.flatMap(point => point.remaining === null ? [] : [point.remaining]);
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const labelStep = Math.ceil(points.length / 6);
  const band = plotW / points.length;
  const shown = active ?? (actual.length ? actual.length - 1 : null);
  const point = shown === null ? null : points[shown];

  return <>
    <div className={styles.legend} aria-hidden="true"><span><i /> Remaining</span><span><i data-dashed="true" /> Ideal</span></div>
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setActive(null)}
      aria-label={actual.length ? `Burndown chart: ${actual.at(-1)} of ${total} tickets remaining after ${actual.length} of ${points.length} days.` : `Burndown chart: the sprint has not started. ${total} tickets are planned.`}>
      {ticks.map(tick => <g key={tick}><line className={styles.gridLine} x1={left} x2={W - right} y1={y(tick)} y2={y(tick)} /><text x={left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
      {points.map((item, index) => index % labelStep === 0 && <text key={item.date} x={x(index)} y={H - 8} textAnchor="middle">{formatDate(item.date)}</text>)}
      <path className={styles.idealLine} d={line(points.map(item => item.ideal))} />
      {actual.length > 0 && <path className={styles.actualLine} d={line(actual)} />}
      {shown !== null && <line className={styles.crosshair} x1={x(shown)} x2={x(shown)} y1={top} y2={top + plotH} />}
      {actual.map((value, index) => (index === shown || actual.length <= 14) && <circle key={index} className={styles.actualDot} cx={x(index)} cy={y(value)} r={index === shown ? 5 : 4} />)}
      {actual.length > 0 && active === null && <text className={styles.valueLabel} x={x(actual.length - 1)} y={y(actual.at(-1)!) - 10} textAnchor={actual.length === points.length ? "end" : "middle"}>{actual.at(-1)}</text>}
      {points.map((item, index) => <rect key={item.date} x={x(index) - band / 2} y={top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setActive(index)} />)}
    </svg>
    <p className={styles.readout} role="status">{point
      ? `${formatDate(point.date)}: ${point.remaining === null ? "not reached yet" : `${point.remaining} remaining`} · ideal ${point.ideal}`
      : "The sprint has not started, so there is no progress line yet."}</p>
    <details className={styles.dataTable}><summary>View burndown as a table</summary>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Day</th><th scope="col">Remaining</th><th scope="col">Ideal</th></tr></thead>
        <tbody>{points.map(item => <tr key={item.date}><td>{formatDate(item.date)}</td><td>{item.remaining ?? "—"}</td><td>{item.ideal}</td></tr>)}</tbody>
      </table></div>
    </details>
  </>;
}

function Velocity({ entries }: { entries: VelocityEntry[] }) {
  if (!entries.length) return <p>Complete a sprint to start tracking velocity.</p>;
  const W = 320, H = 240, left = 30, right = 10, top = 24, bottom = 30;
  const plotW = W - left - right, plotH = H - top - bottom, base = top + plotH;
  const max = Math.max(...entries.map(entry => entry.completed), 1);
  const slot = plotW / entries.length, width = Math.min(44, slot - 12);
  const average = Math.round(entries.reduce((sum, entry) => sum + entry.completed, 0) / entries.length * 10) / 10;
  return <>
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Velocity chart: ${entries.map(entry => `${entry.name} finished ${entry.completed}`).join(", ")}.`}>
      {[...new Set([0, Math.round(max / 2), max])].map(tick => { const at = base - tick / max * plotH; return <g key={tick}><line className={styles.gridLine} x1={left} x2={W - right} y1={at} y2={at} /><text x={left - 8} y={at + 4} textAnchor="end">{tick}</text></g>; })}
      {entries.map((entry, index) => {
        const height = entry.completed / max * plotH, x0 = left + slot * index + (slot - width) / 2, y0 = base - height, r = Math.min(4, height);
        return <g key={entry.id}>
          <title>{`${entry.name}: ${entry.completed} finished, ${entry.carriedOver} carried over`}</title>
          {/* Rounded at the data end only, so the bar stays anchored to the baseline. */}
          {height > 0 && <path className={styles.velocityBar} d={`M${x0} ${base}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}H${x0 + width - r}Q${x0 + width} ${y0} ${x0 + width} ${y0 + r}V${base}Z`} />}
          <text className={styles.valueLabel} x={x0 + width / 2} y={y0 - 6} textAnchor="middle">{entry.completed}</text>
          <text x={x0 + width / 2} y={H - 8} textAnchor="middle">{entry.name.length > 9 ? `${entry.name.slice(0, 8)}…` : entry.name}</text>
        </g>;
      })}
    </svg>
    <p className={styles.readout}>Average: {average} {average === 1 ? "ticket" : "tickets"} per sprint over the last {entries.length === 1 ? "sprint" : `${entries.length} sprints`}.</p>
  </>;
}

function Breakdown({ rows, total }: { rows: { label: string; value: number; done?: boolean; note?: string }[]; total: number }) {
  if (!rows.length) return <p>Nothing to show yet.</p>;
  return <ul className={styles.breakdown}>{rows.map(row => <li key={row.label}>
    <span>{row.label}</span><strong>{row.value}{row.note && <small> · {row.note}</small>}</strong>
    <div className={styles.meter} aria-hidden="true"><span data-done={row.done} style={{ width: `${percent(row.value, total)}%` }} /></div>
  </li>)}</ul>;
}
