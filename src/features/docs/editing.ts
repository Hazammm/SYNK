// Pure text edits behind the editor toolbar. Each returns the new text and the selection to restore.
export type Edit = { text: string; start: number; end: number };

// Wraps the selection, or a placeholder when nothing is selected, in markers such as ** or `.
export function wrapSelection(text: string, start: number, end: number, before: string, after = before, placeholder = "text"): Edit {
  const selected = text.slice(start, end) || placeholder;
  const next = text.slice(0, start) + before + selected + after + text.slice(end);
  return { text: next, start: start + before.length, end: start + before.length + selected.length };
}

// Adds a prefix such as "## " or "- [ ] " to every selected line, or removes it if all lines have it already.
export function toggleLinePrefix(text: string, start: number, end: number, prefix: string): Edit {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", Math.max(end - (end > start && text[end - 1] === "\n" ? 1 : 0), start));
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  const remove = lines.every(line => line.startsWith(prefix));
  const changed = lines.map(line => remove ? line.slice(prefix.length) : prefix + line).join("\n");
  const next = text.slice(0, lineStart) + changed + text.slice(lineEnd);
  return { text: next, start: lineStart, end: lineStart + changed.length };
}
