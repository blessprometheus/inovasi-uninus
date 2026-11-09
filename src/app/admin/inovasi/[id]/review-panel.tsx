"use client";

import { Check, Globe, PencilLine, Play, Trash2, Undo2, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/components/api-client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { InnovationStatus } from "@/modules/workflow/transitions";

type Target = "under_review" | "revision_required" | "approved" | "published" | "unpublished" | "draft";
type Dialog = null | "unpublish" | "delete";

const BTN =
  "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-control px-4 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const PRIMARY = `${BTN} bg-primary text-on-primary hover:bg-primary-hover`;
const OUTLINE = `${BTN} border border-border-input hover:bg-primary-tint`;

/**
 * Panel keputusan. Aksi yang tidak diizinkan disembunyikan, tetapi UI bukan lapisan keamanan:
 * server menolak lagi (izin, pemisahan tugas, catatan wajib) dan pesannya ditampilkan di sini.
 */
export function ReviewPanel({
  id,
  csrf,
  status,
  canReview,
  canPublish,
  canDelete,
  canEdit,
  isOwnSubmission,
}: {
  id: string;
  csrf: string;
  status: InnovationStatus;
  canReview: boolean;
  canPublish: boolean;
  canDelete: boolean;
  canEdit: boolean;
  isOwnSubmission: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approved" | "revision_required">("approved");
  const [note, setNote] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogText, setDialogText] = useState("");

  async function transition(to: Target, withNote?: string, successText?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await apiRequest("POST", `/api/v1/admin/innovations/${id}/transitions`, {
      csrf,
      body: withNote !== undefined ? { to, note: withNote } : { to },
    });
    setBusy(false);
    if (!result.ok) {
      // Gagal terbit karena data belum lengkap: tampilkan semua yang kurang sekaligus.
      setError(result.details.length ? result.details.map((d) => d.message).join(" ") : result.message);
      return false;
    }
    setDone(successText ?? "Status diperbarui.");
    setNote("");
    router.refresh();
    return true;
  }

  async function confirmDialog() {
    if (dialog === "unpublish") {
      if (await transition("unpublished", dialogText.trim(), "Inovasi ditarik dari katalog publik.")) closeDialog();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiRequest("DELETE", `/api/v1/admin/innovations/${id}`, {
      csrf,
      body: { reason: dialogText.trim() },
    });
    if (!result.ok) {
      setError(result.details[0]?.message ?? result.message);
      setBusy(false);
      return;
    }
    router.replace("/admin/inovasi");
    router.refresh();
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setDialogText("");
    setError(null);
  }

  const reviewBlocked = isOwnSubmission && (status === "submitted" || status === "under_review");

  return (
    <aside aria-labelledby="keputusan" className="rounded-card border border-border bg-surface p-5">
      <h2 id="keputusan" className="text-xl font-semibold">
        Tindakan
      </h2>

      <div className="mt-4 space-y-4">
        {canEdit ? (
          <Link href={`/admin/inovasi/${id}/edit`} className={OUTLINE}>
            <PencilLine className="size-5" aria-hidden="true" />
            Edit isi
          </Link>
        ) : null}

        {reviewBlocked ? (
          <p role="note" className="rounded-control bg-primary-tint p-3 text-sm">
            Ini pengajuan Anda sendiri. Operator lain yang harus memeriksa dan menyetujuinya (pemisahan tugas).
          </p>
        ) : null}

        {status === "submitted" && canReview && !reviewBlocked ? (
          <>
            <p className="text-sm text-muted-foreground">Pengajuan menunggu diperiksa.</p>
            <button type="button" disabled={busy} onClick={() => transition("under_review", undefined, "Pemeriksaan dimulai.")} className={PRIMARY}>
              <Play className="size-5" aria-hidden="true" />
              Mulai periksa
            </button>
          </>
        ) : null}

        {status === "under_review" && canReview && !reviewBlocked ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void transition(decision, decision === "revision_required" ? note : undefined, decision === "approved" ? "Pengajuan disetujui." : "Permintaan revisi dikirim ke dosen.");
            }}
          >
            <fieldset>
              <legend className="text-sm font-semibold">Keputusan pemeriksaan</legend>
              <div className="mt-2 space-y-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border-input px-3">
                  <input type="radio" name="keputusan" className="size-5 accent-[var(--color-primary)]" checked={decision === "approved"} onChange={() => setDecision("approved")} />
                  <span className="inline-flex items-center gap-2"><Check className="size-4" aria-hidden="true" />Setujui</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border-input px-3">
                  <input type="radio" name="keputusan" className="size-5 accent-[var(--color-primary)]" checked={decision === "revision_required"} onChange={() => setDecision("revision_required")} />
                  <span className="inline-flex items-center gap-2"><PencilLine className="size-4" aria-hidden="true" />Minta revisi</span>
                </label>
              </div>
            </fieldset>
            {decision === "revision_required" ? (
              <div>
                <label htmlFor="catatan" className="block text-sm font-semibold">
                  Catatan untuk dosen <span aria-hidden="true" className="text-destructive">*</span>
                  <span className="sr-only"> (wajib)</span>
                </label>
                <textarea
                  id="catatan"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  className="mt-1 w-full rounded-control border border-border-input bg-surface px-3 py-2"
                />
                <p className="mt-1 text-sm text-muted-foreground">Jelaskan bagian yang perlu diperbaiki. Dosen akan membacanya.</p>
              </div>
            ) : null}
            <button type="submit" disabled={busy || (decision === "revision_required" && note.trim() === "")} className={PRIMARY}>
              {busy ? "Mengirim…" : "Kirim keputusan"}
            </button>
          </form>
        ) : null}

        {status === "revision_required" ? (
          <p className="text-sm text-muted-foreground">Menunggu dosen memperbaiki dan mengajukan ulang.</p>
        ) : null}
        {status === "draft" ? (
          <>
            <p className="text-sm text-muted-foreground">Draft belum tampil di publik. Terbitkan setelah datanya lengkap.</p>
            {canPublish ? (
              <button type="button" disabled={busy} onClick={() => transition("published", undefined, "Inovasi diterbitkan.")} className={PRIMARY}>
                <Globe className="size-5" aria-hidden="true" />
                Terbitkan
              </button>
            ) : null}
          </>
        ) : null}

        {status === "approved" && canPublish ? (
          <>
            <p className="text-sm text-muted-foreground">Sudah disetujui dan siap tampil di katalog publik.</p>
            <button type="button" disabled={busy} onClick={() => transition("published", undefined, "Inovasi diterbitkan.")} className={PRIMARY}>
              <Globe className="size-5" aria-hidden="true" />
              Terbitkan
            </button>
          </>
        ) : null}

        {status === "published" && canPublish ? (
          <>
            <p className="text-sm text-muted-foreground">Sedang tampil di katalog publik.</p>
            <button type="button" disabled={busy} onClick={() => setDialog("unpublish")} className={OUTLINE}>
              <EyeOff className="size-5" aria-hidden="true" />
              Tarik dari publik
            </button>
          </>
        ) : null}

        {status === "unpublished" && canPublish ? (
          <>
            <p className="text-sm text-muted-foreground">Ditarik dari publik.</p>
            <button type="button" disabled={busy} onClick={() => transition("published", undefined, "Inovasi diterbitkan kembali.")} className={PRIMARY}>
              <Globe className="size-5" aria-hidden="true" />
              Terbitkan kembali
            </button>
            <button type="button" disabled={busy} onClick={() => transition("draft", undefined, "Dikembalikan ke draft.")} className={OUTLINE}>
              <Undo2 className="size-5" aria-hidden="true" />
              Kembalikan ke draft
            </button>
          </>
        ) : null}

        {canDelete ? (
          <div className="border-t border-border pt-4">
            <button
              type="button"
              disabled={busy || status === "published"}
              onClick={() => setDialog("delete")}
              aria-describedby={status === "published" ? "alasan-hapus" : undefined}
              className={`${BTN} border border-destructive text-destructive hover:bg-background`}
            >
              <Trash2 className="size-5" aria-hidden="true" />
              Hapus inovasi
            </button>
            {status === "published" ? (
              <p id="alasan-hapus" className="mt-2 text-sm text-muted-foreground">
                Tarik dari publik dulu sebelum menghapus.
              </p>
            ) : null}
          </div>
        ) : null}

        <p aria-live="polite" className="text-sm font-medium text-success">
          {done}
        </p>
        {error && dialog === null ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={dialog === "unpublish"}
        title="Tarik dari publik?"
        description="Inovasi langsung hilang dari katalog, pencarian, dan sitemap. Alasan Anda tercatat di riwayat."
        confirmLabel="Tarik dari publik"
        busy={busy}
        error={dialog === "unpublish" ? error : null}
        confirmDisabled={dialogText.trim() === ""}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        <DialogText id="alasan-tarik" label="Alasan penarikan (wajib)" value={dialogText} onChange={setDialogText} max={1000} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        title="Hapus inovasi ini?"
        description="Inovasi hilang dari semua daftar. Riwayat status dan catatan alasan tetap tersimpan untuk penelusuran."
        confirmLabel="Hapus inovasi"
        destructive
        busy={busy}
        error={dialog === "delete" ? error : null}
        confirmDisabled={dialogText.trim().length < 3}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        <DialogText id="alasan-hapus-teks" label="Alasan penghapusan (wajib, minimal 3 karakter)" value={dialogText} onChange={setDialogText} max={500} />
      </ConfirmDialog>
    </aside>
  );
}

function DialogText({
  id,
  label,
  value,
  onChange,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        rows={3}
        className="mt-1 w-full rounded-control border border-border-input bg-surface px-3 py-2"
      />
    </div>
  );
}
