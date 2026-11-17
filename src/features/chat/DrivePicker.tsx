"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { FileText, X } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import { messageOf, request } from "./client";
import styles from "./Chat.module.css";

const DRIVE_SCOPE = "openid email profile https://www.googleapis.com/auth/drive.readonly";
const DRIVE_RESUME_KEY = "synk-drive-attach";

type DriveFile = { id: string; name: string; mimeType: string; size: number | null };
type DriveStatus = { available: boolean; connected: boolean; files: DriveFile[] };

export function resumeDrivePicker(channelId: string) {
  return sessionStorage.getItem(DRIVE_RESUME_KEY) === channelId;
}

function clearDriveResume() {
  sessionStorage.removeItem(DRIVE_RESUME_KEY);
}

function formatSize(size: number | null) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function DrivePicker({
  workspaceId,
  channelId,
  onClose,
  onAttached,
}: {
  workspaceId: string;
  channelId: string;
  onClose: () => void;
  onAttached: (file: { id: string; fileName: string; size: number }) => void;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [connected, setConnected] = useState(false);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [importingId, setImportingId] = useState("");
  const [error, setError] = useState("");

  function applyStatus(status: DriveStatus) {
    setAvailable(status.available);
    setConnected(status.connected);
    setFiles(status.files);
    setLoading(false);
  }

  useEffect(() => {
    clearDriveResume();
    let cancelled = false;
    request<DriveStatus>(`/api/workspaces/${workspaceId}/drive`)
      .then(status => {
        if (!cancelled) applyStatus(status);
      })
      .catch(err => {
        if (cancelled) return;
        setError(messageOf(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function load(search = "") {
    setLoading(true);
    setError("");
    try {
      const params = search ? `?q=${encodeURIComponent(search)}` : "";
      applyStatus(await request<DriveStatus>(`/api/workspaces/${workspaceId}/drive${params}`));
    } catch (err) {
      setError(messageOf(err));
      setLoading(false);
    }
  }

  async function connect() {
    sessionStorage.setItem(DRIVE_RESUME_KEY, channelId);
    await signIn("google", { callbackUrl: window.location.href }, {
      scope: DRIVE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
  }

  async function choose(file: DriveFile) {
    setImportingId(file.id);
    setError("");
    try {
      const result = await request<{ attachment: { id: string; fileName: string; size: number } }>(
        `/api/workspaces/${workspaceId}/drive`,
        { method: "POST", body: JSON.stringify({ fileId: file.id }) },
      );
      onAttached(result.attachment);
    } catch (err) {
      setError(messageOf(err));
      setImportingId("");
    }
  }

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.setup} role="dialog" aria-labelledby="drive-picker-title">
        <div className={styles.setupHeader}>
          <h2 id="drive-picker-title">Upload from Drive</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!available && <p>Google Drive is not configured for this app.</p>}

        {available && !connected && !loading && (
          <>
            <p>Allow Google Drive access to choose a file from your Drive.</p>
            <div className={styles.setupFooter}>
              <Button type="button" variant="primary" onClick={() => void connect()}>Connect Google Drive</Button>
            </div>
          </>
        )}

        {available && connected && (
          <form
            onSubmit={event => {
              event.preventDefault();
              void load(query);
            }}
            className={styles.driveSearch}
          >
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search Drive"
              aria-label="Search Drive"
              maxLength={80}
            />
            <Button type="submit" variant="secondary" disabled={loading}>Search</Button>
          </form>
        )}

        {error && <p role="alert">{error}</p>}
        {loading && <p>Loading files from Drive…</p>}

        {available && connected && !loading && files.length === 0 && <p>No files in Drive.</p>}

        {available && connected && files.length > 0 && (
          <ul className={styles.driveList}>
            {files.map(file => (
              <li key={file.id}>
                <button
                  type="button"
                  className={styles.driveFile}
                  disabled={Boolean(importingId)}
                  onClick={() => void choose(file)}
                >
                  <FileText size={16} />
                  <span className={styles.driveFileName}>{file.name}</span>
                  <span className={styles.driveFileSize}>
                    {importingId === file.id ? "Adding…" : formatSize(file.size)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
