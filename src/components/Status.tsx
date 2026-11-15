import Link from "next/link";
import { SearchX } from "lucide-react";
import styles from "./Status.module.css";

// Shown while a page waits for the server. `full` centres it in the whole window (no shell yet).
export function PageLoading({ label, full = false, as: Tag = "div" }: { label: string; full?: boolean; as?: "div" | "main" }) {
  return <Tag role="status" className={styles.loading} data-full={full}><span className={styles.spinner} aria-hidden="true" />{label}</Tag>;
}

export function NotFoundPanel({ title, message, href, action }: { title: string; message: string; href: string; action: string }) {
  return <section className={styles.panel}><SearchX aria-hidden="true" /><h1>{title}</h1><p>{message}</p><Link href={href}>{action}</Link></section>;
}
