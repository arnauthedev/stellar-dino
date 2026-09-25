"use client";

import { useEffect, useRef } from "react";

/** Modal in the game's dialog style (white card, blurred backdrop). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-40px)] overflow-y-auto rounded-card border-0 bg-surface p-7 text-ink shadow-[var(--shadow-dialog)] backdrop:bg-[#25334a22] backdrop:backdrop-blur-md`}
      style={{ width: `min(${wide ? 640 : 420}px, calc(100vw - 32px))` }}
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-[23px] font-medium tracking-[-0.04em]">{title}</h2>
        <button className="icon-btn size-9!" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {open && children}
    </dialog>
  );
}
