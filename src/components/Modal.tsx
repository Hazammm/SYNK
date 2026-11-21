"use client";

import { useEffect, useRef } from "react";

// A native <dialog> opened with showModal(): the browser traps focus inside it, makes the
// page behind inert, closes on Escape and returns focus to the opener when it closes.
export default function Modal({ label, className, onClose, confirmClose, children }: {
  label: string; className: string; onClose: () => void; confirmClose?: () => boolean; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);
  const requestClose = () => { if (!confirmClose || confirmClose()) onClose(); };
  return <dialog ref={ref} className={className} aria-label={label}
    onCancel={event => { event.preventDefault(); requestClose(); }}
    // The dialog element itself only receives clicks on its backdrop, because the content wrapper fills it.
    onClick={event => { if (event.target === ref.current) requestClose(); }}>
    <div>{children}</div>
  </dialog>;
}
