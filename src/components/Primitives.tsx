import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import styles from "./Synk.module.css";

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button {...props} className={`${styles.button} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "done" | "medium" | "high" | "action";
}) {
  return <span className={`${styles.badge} ${styles[`tone${tone}`]}`}>{children}</span>;
}

// Six quiet tints. The same person always gets the same one, so faces are recognisable across screens.
const hueOf = (text: string) => [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;

export function Avatar({ initials, small = false }: { initials: string; small?: boolean }) {
  return <span className={`${styles.avatar} ${small ? styles.avatarSmall : ""}`} data-hue={hueOf(initials)}>{initials}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}>{children}</section>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.input} ${props.className ?? ""}`} />;
}

// A line of placeholder content while data loads.
export function Skeleton({ width = "100%", height = 12 }: { width?: number | string; height?: number }) {
  return <span className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}
