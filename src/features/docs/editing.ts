// Pure text edits behind the editor toolbar. Each returns the new text and the selection to restore.
export type Edit = { text: string; start: number; end: number };

// Wraps the selection, or a placeholder when nothing is selected, in markers such as ** or `.
export function wrapSelection(text: string, start: number, end: number, before: string, after = before, placeholder = "text"): Edit {
  const selected = text.slice(start, end) || placeholder;
  const next = text.slice(0, start) + before + selected + after + text.slice(end);
  return { text: next, start: start + before.length, end: start + before.length + selected.length };
}
