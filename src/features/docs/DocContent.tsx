"use client";

import Link from "next/link";
import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/markdown";
import styles from "./Docs.module.css";

const TICKET_KEY = /\b([A-Z][A-Z0-9]{1,9}-[1-9]\d*)\b/;

// Ticket keys in text become links to the ticket, as in chat.
function withTicketLinks(text: string, workspaceId: string) {
  return text.split(TICKET_KEY).map((part, index) => index % 2
    ? <Link key={index} href={`/tickets/${encodeURIComponent(part)}?workspaceId=${encodeURIComponent(workspaceId)}`}>{part}</Link>
    : <Fragment key={index}>{part}</Fragment>);
}

function InlineContent({ parts, workspaceId }: { parts: Inline[]; workspaceId: string }) {
  return <>{parts.map((part, index) => {
    switch (part.type) {
      case "strong": return <strong key={index}>{part.text}</strong>;
      case "em": return <em key={index}>{part.text}</em>;
      case "code": return <code key={index}>{part.text}</code>;
      case "link": {
        const external = !part.href.startsWith("/");
        return <a key={index} href={part.href} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>{part.text}</a>;
      }
      default: return <Fragment key={index}>{withTicketLinks(part.text, workspaceId)}</Fragment>;
    }
  })}</>;
}

// Renders a page's Markdown as React elements. `onToggleTask` makes checklist items clickable.
export default function DocContent({ source, workspaceId, onToggleTask }: { source: string; workspaceId: string; onToggleTask?: (line: number) => void }) {
  const blocks = parseMarkdown(source);
  if (!blocks.length) return <p className={styles.emptyPage}>This page is empty.</p>;
  return <div className={styles.content}>{blocks.map((block, index) => {
    switch (block.type) {
      case "heading": {
        // The page title is the h1, so content headings start at h2.
        const Tag = (["h2", "h3", "h4"] as const)[block.level - 1];
        return <Tag key={index}><InlineContent parts={block.inline} workspaceId={workspaceId} /></Tag>;
      }
      case "paragraph": return <p key={index}><InlineContent parts={block.inline} workspaceId={workspaceId} /></p>;
      case "quote": return <blockquote key={index}><InlineContent parts={block.inline} workspaceId={workspaceId} /></blockquote>;
      case "rule": return <hr key={index} />;
      case "code": return <pre key={index} data-language={block.language ?? undefined}><code>{block.text}</code></pre>;
      case "list": {
        const List = block.ordered ? "ol" : "ul";
        const tasks = block.items.some(item => item.checked !== null);
        return <List key={index} className={tasks ? styles.tasks : undefined}>{block.items.map(item => <li key={item.line}>
          {item.checked !== null && <input type="checkbox" checked={item.checked} disabled={!onToggleTask} aria-label={item.checked ? "Done" : "Not done"} onChange={() => onToggleTask?.(item.line)} />}
          <span><InlineContent parts={item.inline} workspaceId={workspaceId} /></span>
        </li>)}</List>;
      }
    }
  })}</div>;
}
