import { Check, Clock3, FileText, Hash, KanbanSquare, LayoutDashboard, MessageCircle, Search, Sparkles } from "lucide-react";
import { LogoMark } from "./Logo";
import styles from "./ProductPeek.module.css";

// Illustrations built from the same tokens as the product, so they follow the theme.
// They are decorative: the surrounding copy carries the meaning.

const Face = ({ children, hue }: { children: string; hue: number }) => <span className={styles.face} data-hue={hue}>{children}</span>;

// One ticket key seen in chat, on the board, in the timer and in an AI change request.
export function RecordStory() {
  return (
    <div className={styles.story} aria-hidden="true">
      <div className={`${styles.piece} ${styles.chat}`}>
        <Face hue={1}>MC</Face>
        <div><p className={styles.who}>Maya Chen <time>10:42</time></p><p>Can we get <code>SYN-128</code> into review before Friday&apos;s demo?</p></div>
      </div>
      <div className={`${styles.piece} ${styles.ticket}`}>
        <p className={styles.row}><code>SYN-128</code><span className={styles.tag} data-tone="high">High</span></p>
        <p className={styles.title}>Sprint burndown report</p>
        <p className={styles.row}><span className={styles.status}><i />In Progress</span><Face hue={0}>DA</Face></p>
      </div>
      <div className={`${styles.piece} ${styles.confirm}`}>
        <p className={styles.label}><Sparkles size={13} /> Synk AI wants to change SYN-128</p>
        <dl><div><dt>Status</dt><dd><s>In Progress</s> → <strong>Review</strong></dd></div><div><dt>Assignee</dt><dd><s>Daniyal</s> → <strong>Maya</strong></dd></div></dl>
        <p className={styles.buttons}><span className={styles.primary}>Confirm</span><span className={styles.secondary}>Cancel</span></p>
      </div>
      <div className={`${styles.piece} ${styles.timer}`}>
        <span className={styles.pulse}><Clock3 size={14} /></span>
        <div><p className={styles.label}>Tracking</p><p><code>SYN-128</code> Sprint burndown report</p></div>
        <output>01:24:06</output>
      </div>
    </div>
  );
}

const COLUMNS: { name: string; done?: boolean; cards: { key: string; title: string; tone?: "high" | "medium"; tag?: string; who: string; hue: number }[] }[] = [
  { name: "To Do", cards: [
    { key: "SYN-131", title: "Invite flow for new teammates", tone: "medium", tag: "Medium", who: "MC", hue: 1 },
    { key: "SYN-134", title: "Export sprint report as CSV", who: "DA", hue: 0 },
  ] },
  { name: "In Progress", cards: [
    { key: "SYN-128", title: "Sprint burndown report", tone: "high", tag: "High", who: "DA", hue: 0 },
    { key: "SYN-129", title: "Ticket comments with mentions", who: "RK", hue: 2 },
    { key: "SYN-133", title: "Weekly hours chart", tone: "medium", tag: "Medium", who: "MC", hue: 1 },
  ] },
  { name: "Review", cards: [
    { key: "SYN-126", title: "Confirm before the agent edits a ticket", tone: "high", tag: "High", who: "RK", hue: 2 },
  ] },
  { name: "Done", done: true, cards: [
    { key: "SYN-121", title: "Drag tickets between columns", who: "MC", hue: 1 },
    { key: "SYN-119", title: "Live chat with threads", who: "DA", hue: 0 },
  ] },
];

// A miniature of the board inside the app window.
export function BoardWindow() {
  return (
    <div className={styles.window} aria-hidden="true">
      <div className={styles.rail}>
        <p className={styles.brand}><LogoMark size={16} /> synk</p>
        <p className={styles.ws}><b>F</b> FYP Team</p>
        {[[LayoutDashboard, "Overview"], [MessageCircle, "Chat"], [KanbanSquare, "Board"], [FileText, "Docs"], [Clock3, "Time"]].map(([Icon, label]) => {
          const I = Icon as typeof Clock3;
          return <p key={label as string} className={styles.navItem} data-active={label === "Board"}><I size={13} /> {label as string}</p>;
        })}
        <p className={styles.navLabel}>Conversations</p>
        <p className={styles.navItem}><Hash size={13} /> general</p>
        <p className={styles.navItem}><Hash size={13} /> development</p>
      </div>
      <div className={styles.pane}>
        <div className={styles.top}><span className={styles.find}><Search size={12} /> Search tickets, pages and messages</span><span className={styles.ai}><Sparkles size={12} /> Ask Synk AI</span></div>
        <div className={styles.head}><b>Board</b><span>Sprint 4 · 6 days left</span><span className={styles.progress}><i /></span><span>5 of 8 done</span></div>
        <div className={styles.columns}>
          {COLUMNS.map(column => <div key={column.name} className={styles.column}>
            <p className={styles.columnHead}><i data-done={column.done} />{column.name}<span>{column.cards.length}</span></p>
            {column.cards.map(card => <div key={card.key} className={styles.card}>
              <p className={styles.row}><code>{card.key}</code>{card.tag && <span className={styles.tag} data-tone={card.tone}>{card.tag}</span>}</p>
              <p className={styles.title}>{card.title}</p>
              <p className={styles.row}>{column.done ? <span className={styles.doneMark}><Check size={11} /> Done</span> : <span />}<Face hue={card.hue}>{card.who}</Face></p>
            </div>)}
          </div>)}
        </div>
      </div>
    </div>
  );
}
