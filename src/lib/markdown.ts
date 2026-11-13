// A small Markdown dialect for docs, parsed into plain data that React renders.
// No HTML is ever produced from the source, so a page cannot inject markup or scripts.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type ListItem = { inline: Inline[]; checked: boolean | null; line: number };
export type Block =
  | { type: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "code"; language: string | null; text: string }
  | { type: "quote"; inline: Inline[] }
  | { type: "rule" };

const FENCE = /^```\s*([\w+-]*)\s*$/;
const FENCE_END = /^```\s*$/;
const HEADING = /^(#{1,3})\s+(.+)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^>\s?(.*)$/;
const ITEM = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/;
const TASK = /^\[( |x|X)\]\s+(.*)$/;

const startsBlock = (line: string) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);

// Only links that cannot run code: web, email and same-site paths.
export function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

const INLINE = /(\*\*[^*\n]+\*\*)|(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s][^*\n]*\*)|(_[^_\s][^_\n]*_)/g;

export function parseInline(source: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  const push = (part: Inline) => {
    const previous = parts.at(-1);
    if (part.type === "text" && previous?.type === "text") previous.text += part.text;
    else if (part.type !== "text" || part.text) parts.push(part);
  };
  for (const match of source.matchAll(INLINE)) {
    push({ type: "text", text: source.slice(last, match.index) });
    const [token] = match;
    if (match[1]) push({ type: "strong", text: token.slice(2, -2) });
    else if (match[2]) push({ type: "code", text: token.slice(1, -1) });
    else if (match[3]) {
      const [, text, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!;
      const safe = safeHref(href);
      push(safe ? { type: "link", text, href: safe } : { type: "text", text: token });
    } else push({ type: "em", text: token.slice(1, -1) });
    last = match.index + token.length;
  }
  push({ type: "text", text: source.slice(last) });
  return parts;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      index++;
      while (index < lines.length && !FENCE_END.test(lines[index])) body.push(lines[index++]);
      index++; // the closing fence, if there is one
      blocks.push({ type: "code", language: fence[1] || null, text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, inline: parseInline(heading[2].trim()) });
      index++; continue;
    }
    if (RULE.test(line)) { blocks.push({ type: "rule" }); index++; continue; }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) body.push(QUOTE.exec(lines[index++])![1]);
      blocks.push({ type: "quote", inline: parseInline(body.join(" ").trim()) });
      continue;
    }
    const first = ITEM.exec(line);
    if (first) {
      const ordered = /\d/.test(first[1]);
      const items: ListItem[] = [];
      // A list continues while lines are items of the same kind.
      for (let item = ITEM.exec(lines[index]); index < lines.length && item && /\d/.test(item[1]) === ordered; item = ITEM.exec(lines[index] ?? "")) {
        const task = TASK.exec(item[2]);
        items.push({ inline: parseInline((task ? task[2] : item[2]).trim()), checked: task ? task[1] !== " " : null, line: index });
        index++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const body: string[] = [];
    while (index < lines.length && lines[index].trim() && (body.length === 0 || !startsBlock(lines[index]))) body.push(lines[index++].trim());
    blocks.push({ type: "paragraph", inline: parseInline(body.join(" ")) });
  }
  return blocks;
}

// The words of a page without formatting, for search snippets and the AI assistant.
export function plainText(source: string): string {
  const inline = (parts: Inline[]) => parts.map(part => part.text).join("");
  return parseMarkdown(source).map(block => {
    switch (block.type) {
      case "heading": case "paragraph": case "quote": return inline(block.inline);
      case "list": return block.items.map(item => inline(item.inline)).join(" ");
      case "code": return block.text;
      case "rule": return "";
    }
  }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
