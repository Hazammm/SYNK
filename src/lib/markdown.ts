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
