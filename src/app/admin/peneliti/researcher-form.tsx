"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiRequest } from "@/components/api-client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, SelectInput, TextArea, TextInput, fieldId } from "@/components/form-fields";

export interface ResearcherFormValues {
  fullName: string;
  position: string;
  facultyId: string;
  studyProgramId: string;
  bio: string;
  externalLinks: { label: string; url: string }[];
  isPublic: boolean;
}

export const EMPTY_RESEARCHER: ResearcherFormValues = {
  fullName: "",
  position: "",
  facultyId: "",
  studyProgramId: "",
  bio: "",
  externalLinks: [],
  isPublic: true,
};

const text = (s: string): string | null => (s.trim() === "" ? null : s.trim());

function toPayload(v: ResearcherFormValues) {
  return {
    fullName: v.fullName.trim(),
    position: text(v.position),
    facultyId: v.facultyId || null,
    studyProgramId: v.studyProgramId || null,
    bio: text(v.bio),
    // Baris tautan yang kosong seluruhnya dibuang.
    externalLinks: v.externalLinks
      .filter((l) => l.label.trim() || l.url.trim())
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
    isPublic: v.isPublic,
  };
}

/** `externalLinks.0.url` -> `externalLinks`: galat tautan ditampilkan satu tempat. */
const formPath = (apiField: string) => apiField.split(".")[0] ?? apiField;

export function ResearcherForm({
  csrf,
  id,
  initial,
  faculties,
  studyPrograms,
  innovationCount = 0,
}: {
  csrf: string;
  /** Kosong = tambah baru. */
  id?: string;
  initial: ResearcherFormValues;
  faculties: { id: string; name: string }[];
  studyPrograms: { id: string; name: string; facultyId: string }[];
  innovationCount?: number;
}) {
  const router = useRouter();
  const editing = Boolean(id);
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  function set<K extends keyof ResearcherFormValues>(key: K, value: ResearcherFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const programs = studyPrograms.filter((p) => !v.facultyId || p.facultyId === v.facultyId);
  const e = (path: string) => errors[path];

  async function save() {
    setBusy(true);
    setErrors({});
    setBanner(null);
    const result = editing
      ? await apiRequest("PATCH", `/api/v1/admin/researchers/${id}`, { csrf, body: toPayload(v) })
      : await apiRequest("POST", "/api/v1/admin/researchers", { csrf, body: toPayload(v) });
    setBusy(false);
    if (!result.ok) {
      const next: Record<string, string> = {};
      for (const d of result.details) next[formPath(d.field)] ??= d.message;
      setErrors(next);
      setBanner(result.message);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setDirty(false);
    router.push("/admin/peneliti");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setDeleteError(null);
    const result = await apiRequest("DELETE", `/api/v1/admin/researchers/${id}`, { csrf, body: { reason: reason.trim() } });
    if (!result.ok) {
      setDeleteError(result.details[0]?.message ?? result.message);
      setBusy(false);
      return;
    }
    router.replace("/admin/peneliti");
    router.refresh();
  }

  const errorList = Object.entries(errors);

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        void save();
      }}
      noValidate
      className="space-y-6"
    >
      {errorList.length > 0 || banner ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-card border border-destructive bg-surface p-4 text-sm">
          <p className="font-semibold text-destructive">{banner ?? "Periksa kembali isian Anda."}</p>
          {errorList.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errorList.map(([path, message]) => (
                <li key={path}>
                  <a href={`#${fieldId(path)}`} className="font-medium underline">
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-5 rounded-card border border-border bg-surface p-5 sm:p-6">
        <Field path="fullName" label="Nama lengkap" required error={e("fullName")} hint="Tulis lengkap dengan gelar sesuai berkas dosen.">
          {(p) => (
            <TextInput {...p} value={v.fullName} onChange={(x) => set("fullName", x.target.value)} maxLength={150} error={e("fullName")} />
          )}
        </Field>
        <Field path="position" label="Jabatan" error={e("position")} hint="Opsional, mis. jabatan fungsional.">
          {(p) => (
            <TextInput {...p} value={v.position} onChange={(x) => set("position", x.target.value)} maxLength={150} error={e("position")} />
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field path="facultyId" label="Fakultas" error={e("facultyId")}>
            {(p) => (
              <SelectInput
                {...p}
                value={v.facultyId}
                onChange={(x) => {
                  set("facultyId", x.target.value);
                  // Program studi dari fakultas lain tidak boleh terbawa.
                  set("studyProgramId", "");
                }}
                error={e("facultyId")}
              >
                <option value="">Belum dipilih</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field path="studyProgramId" label="Program studi" error={e("studyProgramId")}>
            {(p) => (
              <SelectInput {...p} value={v.studyProgramId} onChange={(x) => set("studyProgramId", x.target.value)} error={e("studyProgramId")}>
                <option value="">Belum dipilih</option>
                {programs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
        <Field path="bio" label="Profil singkat" error={e("bio")} hint="Opsional. Teks biasa.">
          {(p) => <TextArea {...p} value={v.bio} onChange={(x) => set("bio", x.target.value)} maxLength={3000} rows={5} error={e("bio")} />}
        </Field>
      </section>

      <section id={fieldId("externalLinks")} tabIndex={-1} className="rounded-card border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Tautan luar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Opsional, maksimal 5. Mis. Google Scholar atau SINTA. Hanya alamat yang diawali http:// atau https://.
        </p>
        {e("externalLinks") ? <p className="mt-2 text-sm font-medium text-destructive">{e("externalLinks")}</p> : null}
        <ul className="mt-3 space-y-3">
          {v.externalLinks.map((link, i) => (
            <li key={i} className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
              <Field path={`link-label-${i}`} label="Label">
                {(p) => (
                  <TextInput
                    {...p}
                    value={link.label}
                    maxLength={40}
                    onChange={(x) => set("externalLinks", v.externalLinks.map((l, j) => (j === i ? { ...l, label: x.target.value } : l)))}
                  />
                )}
              </Field>
              <Field path={`link-url-${i}`} label="Alamat">
                {(p) => (
                  <TextInput
                    {...p}
                    type="url"
                    inputMode="url"
                    value={link.url}
                    maxLength={2048}
                    onChange={(x) => set("externalLinks", v.externalLinks.map((l, j) => (j === i ? { ...l, url: x.target.value } : l)))}
                  />
                )}
              </Field>
              <button
                type="button"
                onClick={() => set("externalLinks", v.externalLinks.filter((_, j) => j !== i))}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-control px-3 text-sm font-semibold text-destructive hover:bg-background"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Hapus<span className="sr-only"> tautan {i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
        {v.externalLinks.length < 5 ? (
          <button
            type="button"
            onClick={() => set("externalLinks", [...v.externalLinks, { label: "", url: "" }])}
            className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border-input px-4 font-semibold hover:bg-primary-tint"
          >
            <Plus className="size-5" aria-hidden="true" />
            Tambah tautan
          </button>
        ) : null}
      </section>

      <section className="rounded-card border border-border bg-surface p-5 sm:p-6">
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={v.isPublic}
            onChange={(x) => set("isPublic", x.target.checked)}
            className="mt-1 size-5 accent-[var(--color-primary)]"
          />
          <span>
            <span className="block font-semibold">Tampilkan profil di direktori peneliti</span>
            <span className="block text-sm text-muted-foreground">
              Bila dimatikan, halaman profil tidak tampil di publik. Nama tetap muncul pada inovasi yang mencantumkannya.
            </span>
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60"
        >
          <Save className="size-5" aria-hidden="true" />
          {busy ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan peneliti"}
        </button>
        {dirty ? <p className="text-sm text-muted-foreground">Perubahan belum disimpan.</p> : null}
        {editing ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-destructive px-5 font-semibold text-destructive hover:bg-background disabled:opacity-60"
          >
            <Trash2 className="size-5" aria-hidden="true" />
            Hapus peneliti
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Hapus peneliti ini?"
        description={
          innovationCount > 0
            ? `Peneliti masih tercantum di ${innovationCount} inovasi, jadi penghapusan akan ditolak. Lepaskan dulu dari inovasi tersebut.`
            : "Profil hilang dari semua daftar. Alasan Anda tercatat di audit log."
        }
        confirmLabel="Hapus peneliti"
        destructive
        busy={busy}
        error={deleteError}
        confirmDisabled={reason.trim().length < 3}
        onConfirm={remove}
        onCancel={() => {
          if (busy) return;
          setConfirmDelete(false);
          setReason("");
          setDeleteError(null);
        }}
      >
        <div>
          <label htmlFor="alasan-hapus-peneliti" className="block text-sm font-semibold">
            Alasan penghapusan (wajib, minimal 3 karakter)
          </label>
          <textarea
            id="alasan-hapus-peneliti"
            value={reason}
            onChange={(x) => setReason(x.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-control border border-border-input bg-surface px-3 py-2"
          />
        </div>
      </ConfirmDialog>
    </form>
  );
}
