import { toCsv } from "@/lib/csv";

// Saves rows as a CSV file from the browser. The byte-order mark makes Excel read it as UTF-8.
export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const url = URL.createObjectURL(new Blob([`﻿${toCsv(rows)}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fileSafe = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sprint";
