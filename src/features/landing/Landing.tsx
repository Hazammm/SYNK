import Link from "next/link";
import { ArrowRight, Check, Clock3, FileText, KanbanSquare, KeyRound, ListChecks, MessageCircle, ScrollText, ShieldCheck } from "lucide-react";
import Logo from "@/components/Logo";
import { BoardWindow, RecordStory } from "@/components/ProductPeek";
import { ThemeToggle } from "@/components/SynkShell";
import styles from "./Landing.module.css";

const MODULES = [
  { icon: MessageCircle, name: "Chat", line: "Channels, threads and live delivery.", detail: "Every recipient's session and channel membership is checked again when a message is published, so removed members stop receiving at once." },
  { icon: KanbanSquare, name: "Issues", line: "Boards, backlog, sprints and reports.", detail: "Drag tickets between columns, plan sprints from the backlog, and read burndown and velocity charts per sprint." },
  { icon: FileText, name: "Docs", line: "Markdown pages in a tree, per project.", detail: "Write, preview and nest pages. A ticket key typed in a page links to the ticket itself." },
  { icon: Clock3, name: "Time", line: "A timer and a weekly timesheet.", detail: "Start a timer on a ticket or add time by hand, then see hours by day, ticket and person." },
];

const AGENT_POINTS = [
  { icon: KeyRound, title: "No credentials of its own", text: "The agent never sees the database. Each turn it gets a five-minute token for one user, one workspace and one conversation." },
  { icon: ListChecks, title: "It asks before it changes", text: "Updates to an existing ticket run as a dry run first. You see every field's old and new value and choose Confirm or Cancel." },
  { icon: ScrollText, title: "Every call is logged", text: "Each tool call that reaches Synk is written to an action log, including previews and denials." },
];

const SECURITY = [
  "One permission function decides access for people, live sockets and the AI agent.",
  "A ticket, page or project you cannot open looks the same as one that does not exist.",
  "Sessions can be revoked. A password change signs out every other device.",
  "Invite and reset links work once and are stored only as hashes.",
];

const STACK = ["Next.js 16", "React 19", "PostgreSQL 16", "Prisma", "Socket.IO", "LangGraph", "Gemini"];

export default function Landing() {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" aria-label="Synk home" className={styles.logo}><Logo size={22} /></Link>
        <nav aria-label="Sections">
          <a href="#product">Product</a>
          <a href="#agent">AI agent</a>
          <a href="#security">Security</a>
        </nav>
        <div className={styles.navActions}>
          <ThemeToggle />
          <Link href="/login" className={styles.ghost}>Sign in</Link>
          <Link href="/create-workspace" className={styles.cta}>Create a workspace</Link>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h1>Chat, tickets, docs and time. <span>One workspace.</span></h1>
            <p>Synk puts the four tools a small team juggles into one app and one data model, with an AI agent that can only do what you are allowed to do.</p>
            <div className={styles.heroActions}>
              <Link href="/create-workspace" className={`${styles.cta} ${styles.large}`}>Create a workspace <ArrowRight size={16} aria-hidden="true" /></Link>
              <Link href="/login" className={`${styles.ghost} ${styles.large}`}>Sign in</Link>
            </div>
          </div>
          <div className={styles.heroVisual}><div className={styles.heroScroll}><BoardWindow /></div></div>
        </section>

        <section id="product" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Four tools, one set of records</h2>
            <p>Most teams split work across a chat tool, a tracker, a wiki and a timesheet, each with its own accounts and search. In Synk a key like <code>SYN-128</code> is the same ticket everywhere it appears.</p>
          </div>
          <ul className={styles.modules}>
            {MODULES.map(({ icon: Icon, name, line, detail }) => <li key={name}>
              <span className={styles.moduleIcon}><Icon size={18} aria-hidden="true" /></span>
              <h3>{name}</h3>
              <p className={styles.moduleLine}>{line}</p>
              <p>{detail}</p>
            </li>)}
          </ul>
        </section>

        <section id="agent" className={`${styles.section} ${styles.split}`}>
          <div>
            <div className={styles.sectionHead}>
              <h2>An AI agent with your permissions, not its own</h2>
              <p>Ask Synk AI to create tickets, write pages or find anything in the workspace. It works through the same access rules you do.</p>
            </div>
            <ul className={styles.points}>
              {AGENT_POINTS.map(({ icon: Icon, title, text }) => <li key={title}>
                <span><Icon size={16} aria-hidden="true" /></span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </li>)}
            </ul>
          </div>
          <div className={styles.splitVisual}><RecordStory /></div>
        </section>

        <section id="security" className={styles.section}>
          <div className={styles.securityBox}>
            <div className={styles.sectionHead}>
              <span className={styles.shield}><ShieldCheck size={20} aria-hidden="true" /></span>
              <h2>Access rules that hold everywhere</h2>
              <p>The same check runs for a browser request, a live socket and an AI tool call, inside the same database transaction as the write.</p>
            </div>
            <ul className={styles.checks}>
              {SECURITY.map(item => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}
            </ul>
          </div>
          <p className={styles.stack}><span>Built with</span>{STACK.map(item => <code key={item}>{item}</code>)}</p>
        </section>

        <section className={styles.closing}>
          <h2>Bring your team into one workspace</h2>
          <p>The person who creates a workspace becomes its admin and can invite everyone else.</p>
          <div className={styles.heroActions}>
            <Link href="/create-workspace" className={`${styles.cta} ${styles.large}`}>Create a workspace <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link href="/login" className={`${styles.ghost} ${styles.large}`}>Sign in</Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Logo size={18} />
        <p>A final year project. Open source under the MIT licence.</p>
        <nav aria-label="Footer">
          <Link href="/login">Sign in</Link>
          <Link href="/create-workspace">Create a workspace</Link>
          <a href="https://github.com/Hazammm/SYNK" rel="noreferrer">Source on GitHub</a>
        </nav>
      </footer>
    </div>
  );
}
