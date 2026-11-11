// Builds CSV text for downloads. Every cell is quoted, and text that a spreadsheet would
// run as a formula (starting with = + - @, tab or carriage return) is prefixed with an apostrophe.
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (value: string | number | null) => {
    const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  };
  return rows.map(row => row.map(cell).join(",")).join("\r\n");
}
