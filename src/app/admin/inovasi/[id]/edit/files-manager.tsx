"use client";

import { FileText, Star, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiRequest } from "@/components/api-client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, SelectInput, TextInput } from "@/components/form-fields";

export interface FileRow {
  id: string;
  kind: "image" | "document";
  visibility: "public" | "restricted";
  title: string | null;
  altText: string | null;
  sizeBytes: number;
  isCover: boolean;
}

const BTN =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function FilesManager({
  csrf,
  innovationId,
  files,
  maxImageMb,
  maxDocumentMb,
  maxFiles,
}: {
  csrf: string;
  innovationId: string;
  files: FileRow[];
  maxImageMb: number;
  maxDocumentMb: number;
  maxFiles: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [alt, setAlt] = useState("");
  const [visibility, setVisibility] = useState<"auto" | "public" | "restricted">("auto");
  const [asCover, setAsCover] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAlt, setDraftAlt] = useState("");
  const [deleting, setDeleting] = useState<FileRow | null>(null);

  async function send(file: File) {
    const form = new FormData();
    form.set("file", file);
    if (title.trim()) form.set("title", title.trim());
    if (alt.trim()) form.set("altText", alt.trim());
    if (visibility !== "auto") form.set("visibility", visibility);
    if (asCover) form.set("isCover", "true");
    try {
      const res = await fetch(`/api/v1/admin/innovations/${innovationId}/files`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": csrf },
        body: form,
      });
      const body = (await res.json().catch(() => null)) as { success: boolean; error?: { message: string; details?: { message: string }[] } } | null;
      if (!res.ok || !body?.success) {
        return body?.error?.details?.[0]?.message ?? body?.error?.message ?? "Unggahan gagal. Coba lagi.";
      }
      return null;
    } catch {
      return "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";
    }
  }

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return setError("Pilih berkas terlebih dulu.");
    setBusy(true);
    setError(null);
    setNotice(null);
    const problem = await send(file);
    setBusy(false);
    if (problem) return setError(problem);
    setNotice("Berkas berhasil diunggah.");
    setTitle("");
    setAlt("");
    setAsCover(false);
    setVisibility("auto");
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function patch(id: string, body: object, okText: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await apiRequest("PATCH", `/api/v1/admin/files/${id}`, { csrf, body });
    setBusy(false);
    if (!result.ok) return setError(result.details[0]?.message ?? result.message);
    setNotice(okText);
    setEditing(null);
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const result = await apiRequest("DELETE", `/api/v1/admin/files/${deleting.id}`, { csrf });
    setBusy(false);
    setDeleting(null);
    if (!result.ok) return setError(result.details[0]?.message ?? result.message);
    setNotice("Berkas dihapus.");
    router.refresh();
  }

  return (
    <section aria-labelledby="berkas" className="mt-10 rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 id="berkas" className="text-xl font-semibold">
        Berkas
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sampul dan dokumen pendukung ({files.length} dari {maxFiles}). Gambar JPG/PNG/WebP maksimal {maxImageMb} MB,
        dokumen PDF maksimal {maxDocumentMb} MB. Metadata gambar (termasuk lokasi) dibuang otomatis. Dokumen baru
        bersifat <strong>terbatas</strong> sampai Anda menjadikannya publik.
      </p>

      <p aria-live="polite" className="mt-3 text-sm font-medium text-success">
        {notice}
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-control border border-destructive bg-surface p-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {files.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Belum ada berkas.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {files.map((f) => (
            <li key={f.id} className="rounded-control border border-border p-3">
              <div className="flex flex-wrap items-start gap-4">
                {f.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Pratinjau dari rute admin sendiri.
                  <img src={`/api/v1/admin/files/${f.id}?v=thumb`} alt={f.altText ?? ""} className="h-20 w-32 shrink-0 rounded-control border border-border object-cover" />
                ) : (
                  <span className="flex h-20 w-32 shrink-0 items-center justify-center rounded-control bg-primary-tint text-primary">
                    <FileText className="size-8" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{f.title ?? "(tanpa judul)"}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{f.kind === "image" ? "Gambar" : "PDF"} · {size(f.sizeBytes)}</span>
                    <span className={`rounded-control px-2 py-0.5 text-xs font-semibold ${f.visibility === "public" ? "bg-primary-tint text-primary" : "bg-background text-muted-foreground"}`}>
                      {f.visibility === "public" ? "Publik" : "Terbatas"}
                    </span>
                    {f.isCover ? (
                      <span className="inline-flex items-center gap-1 rounded-control bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
                        <Star className="size-3.5" aria-hidden="true" />
                        Sampul
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {f.kind === "image" && !f.isCover ? (
                      <button type="button" disabled={busy} onClick={() => void patch(f.id, { isCover: true, visibility: "public" }, "Sampul diperbarui.")} className={`${BTN} border border-border-input hover:bg-primary-tint`}>
                        Jadikan sampul
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patch(f.id, { visibility: f.visibility === "public" ? "restricted" : "public" }, f.visibility === "public" ? "Berkas dibatasi." : "Berkas dipublikasikan.")}
                      className={`${BTN} border border-border-input hover:bg-primary-tint`}
                    >
                      {f.visibility === "public" ? "Jadikan terbatas" : "Jadikan publik"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(editing === f.id ? null : f.id);
                        setDraftTitle(f.title ?? "");
                        setDraftAlt(f.altText ?? "");
                      }}
                      aria-expanded={editing === f.id}
                      className={`${BTN} border border-border-input hover:bg-primary-tint`}
                    >
                      Ubah keterangan
                    </button>
                    <button type="button" disabled={busy} onClick={() => setDeleting(f)} className={`${BTN} border border-destructive text-destructive hover:bg-background`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      Hapus<span className="sr-only"> {f.title ?? "berkas"}</span>
                    </button>
                  </div>
                  {editing === f.id ? (
                    <form
                      className="mt-3 grid gap-3 sm:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void patch(f.id, f.kind === "image" ? { title: draftTitle, altText: draftAlt } : { title: draftTitle }, "Keterangan disimpan.");
                      }}
                    >
                      <Field path={`t-${f.id}`} label="Judul">
                        {(p) => <TextInput {...p} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} maxLength={150} />}
                      </Field>
                      {f.kind === "image" ? (
                        <Field path={`a-${f.id}`} label="Teks alternatif" hint="Deskripsi singkat gambar untuk pembaca layar.">
                          {(p) => <TextInput {...p} value={draftAlt} onChange={(e) => setDraftAlt(e.target.value)} maxLength={300} />}
                        </Field>
                      ) : null}
                      <div className="sm:col-span-2">
                        <button type="submit" disabled={busy} className={`${BTN} bg-primary text-on-primary hover:bg-primary-hover`}>
                          Simpan keterangan
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void upload();
        }}
      >
        <h3 className="text-base font-semibold sm:col-span-2">Unggah berkas baru</h3>
        <div className="sm:col-span-2">
          <label htmlFor="berkas-file" className="block text-sm font-semibold">
            Berkas (JPG, PNG, WebP, atau PDF)
          </label>
          <input
            id="berkas-file"
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            className="mt-1 block w-full rounded-control border border-border-input bg-surface p-2 text-sm file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-on-primary"
          />
        </div>
        <Field path="up-title" label="Judul (opsional)" hint="Bawaan: nama berkas.">
          {(p) => <TextInput {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />}
        </Field>
        <Field path="up-alt" label="Teks alternatif gambar (opsional)" hint="Bawaan: judul inovasi.">
          {(p) => <TextInput {...p} value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} />}
        </Field>
        <Field path="up-vis" label="Visibilitas">
          {(p) => (
            <SelectInput {...p} value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
              <option value="auto">Otomatis (gambar publik, PDF terbatas)</option>
              <option value="public">Publik</option>
              <option value="restricted">Terbatas (hanya operator)</option>
            </SelectInput>
          )}
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end">
          <input type="checkbox" checked={asCover} onChange={(e) => setAsCover(e.target.checked)} className="size-5 accent-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Jadikan sampul (gambar saja)</span>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy || files.length >= maxFiles} className={`${BTN} bg-primary px-5 text-on-primary hover:bg-primary-hover`}>
            <Upload className="size-5" aria-hidden="true" />
            {busy ? "Mengunggah…" : "Unggah"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={deleting !== null}
        title="Hapus berkas ini?"
        description="Berkas dihapus permanen dari server dan langsung hilang dari halaman publik."
        confirmLabel="Hapus berkas"
        destructive
        busy={busy}
        onConfirm={remove}
        onCancel={() => !busy && setDeleting(null)}
      />
    </section>
  );
}
