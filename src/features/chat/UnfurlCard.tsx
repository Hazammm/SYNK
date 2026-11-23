"use client";

import type { ChatUnfurl } from "@/lib/chat-types";
import styles from "./Chat.module.css";

export default function UnfurlCard({ unfurl }: { unfurl: ChatUnfurl }) {
  if (!unfurl.title && !unfurl.description) return null;
  return <a className={styles.unfurlCard} href={unfurl.url} target="_blank" rel="noopener noreferrer">
    {unfurl.imageUrl && <img src={unfurl.imageUrl} alt="" />}
    <span>
      {unfurl.siteName && <small>{unfurl.siteName}</small>}
      <strong>{unfurl.title || unfurl.url}</strong>
      {unfurl.description && <em>{unfurl.description}</em>}
    </span>
  </a>;
}
