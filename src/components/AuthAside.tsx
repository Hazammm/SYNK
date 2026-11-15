import { RecordStory } from "./ProductPeek";
import { ThemeToggle } from "./SynkShell";
import styles from "./Auth.module.css";

// The right-hand panel on sign-in and onboarding pages: what Synk is, shown with one ticket key in four places.
export default function AuthAside() {
  return <>
    <div className={styles.themeCorner}><ThemeToggle /></div>
    <aside className={styles.aside}>
      <div className={styles.asideInner}>
        <h2>One record, wherever your team mentions it.</h2>
        <p>A ticket key in chat, on the board, in a page or in an AI reply always points to the same ticket, under the same permissions.</p>
        <RecordStory />
      </div>
    </aside>
  </>;
}
