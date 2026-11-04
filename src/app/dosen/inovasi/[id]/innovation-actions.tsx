"use client";

import { Pencil, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/components/api-client";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Pending = null | "withdraw" | "delete";

/** Tombol aksi pemilik. Server tetap memeriksa status dan kepemilikan; tombol ini hanya kemudahan. */
export function InnovationActions({
  id,
  csrf,
  canEdit,
  canWithdraw,
  canDelete,
}: {
  id: string;
  csrf: string;
  canEdit: boolean;
  canWithdraw: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setPending(null);
    setError(null);
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const result =
      pending === "withdraw"
        ? await apiRequest("POST", `/api/v1/me/innovations/${id}/withdraw`, { csrf })
        : await apiRequest("DELETE", `/api/v1/me/innovations/${id}`, { csrf });
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    if (pending === "delete") {
      router.replace("/dosen");
    } else {
      setPending(null);
    }
    router.refresh();
    setBusy(false);
  }

  const button =
    "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 font-semibold transition-colors";

  return (
    <div className="flex flex-wrap gap-3">
      {canEdit ? (
        <Link href={`/dosen/inovasi/${id}/edit`} className={`${button} border-primary bg-primary text-on-primary hover:bg-primary-hover`}>
          <Pencil className="size-5" aria-hidden="true" />
          Edit
        </Link>
      ) : null}
      {canWithdraw ? (
        <button type="button" onClick={() => setPending("withdraw")} className={`${button} border-border-input hover:bg-primary-tint`}>
          <Undo2 className="size-5" aria-hidden="true" />
          Tarik pengajuan
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" onClick={() => setPending("delete")} className={`${button} border-destructive text-destructive hover:bg-background`}>
          <Trash2 className="size-5" aria-hidden="true" />
          Hapus draft
        </button>
      ) : null}

      <ConfirmDialog
        open={pending === "withdraw"}
        title="Tarik pengajuan?"
        description="Pengajuan kembali menjadi draft dan tidak lagi diperiksa operator. Anda dapat mengeditnya lalu mengajukan ulang."
        confirmLabel="Tarik pengajuan"
        busy={busy}
        error={pending === "withdraw" ? error : null}
        onConfirm={confirm}
        onCancel={close}
      />
      <ConfirmDialog
        open={pending === "delete"}
        title="Hapus draft ini?"
        description="Draft akan dihapus dari daftar Anda. Tindakan ini tidak dapat dibatalkan dari halaman ini."
        confirmLabel="Hapus draft"
        destructive
        busy={busy}
        error={pending === "delete" ? error : null}
        onConfirm={confirm}
        onCancel={close}
      />
    </div>
  );
}
