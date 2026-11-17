"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { isTiptapDoc } from "@/lib/validation";
import { parseInline, safeHref, type Inline } from "@/lib/markdown";
import styles from "./Chat.module.css";

type TiptapNode = {
  type: string;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
};

function renderTextWithTickets(text: string, workspaceId: string): React.ReactNode[] {
  const ticketRegex = /\b([A-Z][A-Z0-9]{1,9}-[1-9]\d*)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ticketRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const key = match[1];
    parts.push(
      <Link
        key={`${key}-${match.index}`}
        href={`/tickets/${encodeURIComponent(key)}?workspaceId=${encodeURIComponent(workspaceId)}`}
        className={styles.ticketLink}
        onClick={e => e.stopPropagation()}
      >
        {key}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
}

function renderNode(node: TiptapNode, index: number, workspaceId: string): React.ReactNode {
  if (node.type === "text") {
    const rawText = node.text || "";
    let content: React.ReactNode = renderTextWithTickets(rawText, workspaceId);

    if (node.marks && Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type === "bold") {
          content = <strong key="b">{content}</strong>;
        } else if (mark.type === "italic") {
          content = <em key="i">{content}</em>;
        } else if (mark.type === "underline") {
          content = <u key="u">{content}</u>;
        } else if (mark.type === "strike") {
          content = <s key="s">{content}</s>;
        } else if (mark.type === "code") {
          content = <code key="c" className={styles.inlineCode}>{content}</code>;
        } else if (mark.type === "link") {
          // Only http(s), mailto and in-app links; anything else (javascript:, data:) is shown as plain text.
          const href = typeof mark.attrs?.href === "string" ? safeHref(mark.attrs.href) : null;
          if (href) content = (
            <a
              key="l"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.messageLink}
              onClick={e => e.stopPropagation()}
            >
              {content}
            </a>
          );
        }
      }
    }
    return <React.Fragment key={index}>{content}</React.Fragment>;
  }

  if (node.type === "paragraph") {
    const inner = node.content?.map((child, i) => renderNode(child, i, workspaceId));
    return (
      <p key={index} className={styles.richParagraph}>
        {inner && inner.length > 0 ? inner : <br />}
      </p>
    );
  }

  if (node.type === "blockquote") {
    return (
      <blockquote key={index} className={styles.richBlockquote}>
        {node.content?.map((child, i) => renderNode(child, i, workspaceId))}
      </blockquote>
    );
  }

  if (node.type === "codeBlock") {
    return (
      <pre key={index} className={styles.richCodeBlock}>
        <code>{node.content?.map((child, i) => renderNode(child, i, workspaceId))}</code>
      </pre>
    );
  }

  if (node.type === "bulletList") {
    return (
      <ul key={index} className={styles.richBulletList}>
        {node.content?.map((child, i) => renderNode(child, i, workspaceId))}
      </ul>
    );
  }

  if (node.type === "orderedList") {
    return (
      <ol key={index} className={styles.richOrderedList}>
        {node.content?.map((child, i) => renderNode(child, i, workspaceId))}
      </ol>
    );
  }

  if (node.type === "listItem") {
    return (
      <li key={index} className={styles.richListItem}>
        {node.content?.map((child, i) => renderNode(child, i, workspaceId))}
      </li>
    );
  }

  if (node.type === "hardBreak") {
    return <br key={index} />;
  }

  if (node.content) {
    return (
      <span key={index}>
        {node.content.map((child, i) => renderNode(child, i, workspaceId))}
      </span>
    );
  }

  return null;
}

function renderLegacyInline(token: Inline, index: number, workspaceId: string): React.ReactNode {
  if (token.type === "text") {
    return <React.Fragment key={index}>{renderTextWithTickets(token.text, workspaceId)}</React.Fragment>;
  }
  if (token.type === "strong") {
    return <strong key={index}>{renderTextWithTickets(token.text, workspaceId)}</strong>;
  }
  if (token.type === "em") {
    return <em key={index}>{renderTextWithTickets(token.text, workspaceId)}</em>;
  }
  if (token.type === "code") {
    return <code key={index} className={styles.inlineCode}>{token.text}</code>;
  }
  if (token.type === "link") {
    const href = safeHref(token.href);
    if (!href) return <span key={index}>{token.text}</span>;
    return (
      <a
        key={index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.messageLink}
        onClick={e => e.stopPropagation()}
      >
        {token.text}
      </a>
    );
  }
  return null;
}

export function TiptapRenderer({ content, workspaceId }: { content: string; workspaceId: string }) {
  const parsed = useMemo(() => {
    if (!content) return null;
    if (content.startsWith("{") && content.endsWith("}")) {
      try {
        const obj = JSON.parse(content);
        if (isTiptapDoc(obj)) {
          return obj as TiptapNode;
        }
      } catch {
        // Not JSON
      }
    }
    return null;
  }, [content]);

  if (parsed && parsed.content) {
    return (
      <div className={styles.richMessageBody}>
        {parsed.content.map((child, i) => renderNode(child, i, workspaceId))}
      </div>
    );
  }

  // Legacy fallback: markdown / plain text
  const tokens = parseInline(content);
  return (
    <div className={styles.richMessageBody}>
      {tokens.map((token, i) => renderLegacyInline(token, i, workspaceId))}
    </div>
  );
}
