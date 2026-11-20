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

// Shows the photo when there is one, otherwise the initials on a tinted circle. A green dot marks someone online.
export function Avatar({ initials, small = false, src, online }: { initials: string; small?: boolean; src?: string | null; online?: boolean }) {
  return <span className={`${styles.avatar} ${small ? styles.avatarSmall : ""}`} data-hue={hueOf(initials)}>
    {/* eslint-disable-next-line @next/next/no-img-element -- small, authenticated images that next/image cannot optimise */}
    {src ? <img src={src} alt="" className={styles.avatarImage} /> : initials}
    {online !== undefined && <i className={styles.presence} data-online={online} aria-hidden="true" />}
  </span>;
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
