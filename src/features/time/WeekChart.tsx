"use client";

import { useState } from "react";
import { formatDuration, hours } from "./calc";
import report from "../tickets/Tracker.module.css";
import styles from "./Time.module.css";

// Hours per day for one week: a single series, so the title names it and no legend is needed.
export default function WeekChart({ days, seconds }: { days: Date[]; seconds: number[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 560, H = 220, left = 34, right = 10, top = 22, bottom = 30;
  const plotW = W - left - right, plotH = H - top - bottom, base = top + plotH;
  const maxHours = Math.max(1, Math.ceil(Math.max(...seconds) / 3600));
  const slot = plotW / days.length, width = Math.min(46, slot - 14);
  const label = (day: Date) => day.toLocaleDateString(undefined, { weekday: "short" });
  const peak = seconds.indexOf(Math.max(...seconds));
  const shown = active ?? (seconds[peak] > 0 ? peak : null);
  const total = seconds.reduce((sum, value) => sum + value, 0);

  return <>
    <svg className={report.chart} viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setActive(null)}
      aria-label={`Hours per day: ${days.map((day, index) => `${label(day)} ${formatDuration(seconds[index])}`).join(", ")}.`}>
      {[...new Set([0, Math.round(maxHours / 2), maxHours])].map(tick => { const at = base - tick / maxHours * plotH; return <g key={tick}><line className={report.gridLine} x1={left} x2={W - right} y1={at} y2={at} /><text x={left - 8} y={at + 4} textAnchor="end">{tick}h</text></g>; })}
      {days.map((day, index) => {
        const height = seconds[index] / 3600 / maxHours * plotH, x0 = left + slot * index + (slot - width) / 2, y0 = base - height, r = Math.min(4, height);
        return <g key={index} onMouseEnter={() => setActive(index)}>
          {/* The whole column is the hover target, so short bars are easy to point at. */}
          <rect x={left + slot * index} y={top} width={slot} height={plotH} fill="transparent" />
          {height > 0 && <path className={styles.bar} data-active={index === shown} d={`M${x0} ${base}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}H${x0 + width - r}Q${x0 + width} ${y0} ${x0 + width} ${y0 + r}V${base}Z`} />}
          {index === shown && seconds[index] > 0 && <text className={report.valueLabel} x={x0 + width / 2} y={y0 - 6} textAnchor="middle">{hours(seconds[index])}h</text>}
          <text x={x0 + width / 2} y={H - 8} textAnchor="middle">{label(day)}</text>
        </g>;
      })}
    </svg>
    <p className={report.readout} role="status">{shown === null
      ? "No time logged this week."
      : `${days[shown].toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}: ${formatDuration(seconds[shown])}`}</p>
    <details className={report.dataTable}><summary>View hours per day as a table</summary>
      <div className={report.tableWrap}><table className={report.table}>
        <thead><tr><th scope="col">Day</th><th scope="col">Time</th></tr></thead>
        <tbody>{days.map((day, index) => <tr key={index}><td>{day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</td><td>{formatDuration(seconds[index])}</td></tr>)}
          <tr><th scope="row">Total</th><td>{formatDuration(total)}</td></tr></tbody>
      </table></div>
    </details>
  </>;
}
