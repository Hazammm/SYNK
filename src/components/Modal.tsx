"use client";

import { useEffect, useRef } from "react";

// A native <dialog> opened with showModal(): the browser traps focus inside it, makes the
// page behind inert and closes on Escape. Focus goes back to the opener when it closes.
export default function Modal({ label, className, onClose, confirmClose, children }: {
  label: string; className: string; onClose: () => void; confirmClose?: () => boolean; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => { dialog.close(); opener?.focus(); };
  }, []);
  const requestClose = () => { if (!confirmClose || confirmClose()) onClose(); };
  return <dialog ref={ref} className={className} aria-label={label}
    onCancel={event => { event.preventDefault(); requestClose(); }}
    // The dialog element itself only receives clicks on its backdrop, because the content wrapper fills it.
    onClick={event => { if (event.target === ref.current) requestClose(); }}>
    <div>{children}</div>
  </dialog>;
}
