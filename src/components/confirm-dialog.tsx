"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Dialog konfirmasi berbasis <dialog> bawaan browser: fokus terkurung, Esc menutup, latar tidak bisa
 * diklik. Aksi destruktif diberi nama eksplisit lewat confirmLabel (UI_UX_GUIDELINES §5).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  error,
  children,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  /** Isian tambahan (mis. alasan) yang tampil di antara deskripsi dan tombol. */
  children?: ReactNode;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Id unik per dialog: satu halaman bisa memasang beberapa dialog sekaligus.
  const uid = useId();
  const titleId = `${uid}-judul`;
  const descId = `${uid}-deskripsi`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-6 text-foreground shadow-lg backdrop:bg-foreground/50"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        {title}
      </h2>
      <p id={descId} className="mt-2 text-muted-foreground">
        {description}
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border-input px-5 font-semibold hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-60"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
          className={`inline-flex min-h-11 cursor-pointer items-center rounded-control px-5 font-semibold text-on-primary disabled:cursor-wait disabled:opacity-60 ${
            destructive ? "bg-destructive hover:opacity-90" : "bg-primary hover:bg-primary-hover"
          }`}
        >
          {busy ? "Memproses…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
