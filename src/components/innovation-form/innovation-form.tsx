"use client";

import { CheckCircle2, Circle, Globe, Plus, Save, Send, TriangleAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/components/api-client";
import { Field, SelectInput, TextArea, TextInput, fieldId } from "@/components/form-fields";
import { ResearcherPicker } from "@/components/researcher-picker";
import { missingForSubmission } from "@/modules/innovations/submission";
import type { FormRefs, FormValues } from "./form-types";

const LONG_TEXTS = [
  { key: "abstract", label: "Abstrak", max: 5000, rows: 5 },
  { key: "background", label: "Latar belakang", max: 5000, rows: 5 },
  { key: "problemStatement", label: "Rumusan masalah", max: 5000, rows: 4 },
  { key: "objective", label: "Tujuan", max: 5000, rows: 4 },
  { key: "methodology", label: "Metodologi", max: 5000, rows: 5 },
  { key: "description", label: "Deskripsi inovasi", max: 10000, rows: 8 },
  { key: "advantages", label: "Keunggulan", max: 5000, rows: 4 },
  { key: "benefits", label: "Manfaat", max: 5000, rows: 4 },
  { key: "developmentPotential", label: "Potensi pengembangan", max: 5000, rows: 4 },
] as const;

const num = (s: string): number | null => {
  const n = Number.parseInt(s, 10);
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};
const text = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** Nilai formulir -> isi permintaan API. Baris publikasi/HKI yang kosong seluruhnya dibuang. */
function toPayload(v: FormValues) {
  return {
    title: v.title,
    summary: v.summary,
    abstract: v.abstract,
    background: v.background,
    problemStatement: v.problemStatement,
    objective: v.objective,
    methodology: v.methodology,
    description: v.description,
    advantages: v.advantages,
    benefits: v.benefits,
    developmentPotential: v.developmentPotential,
    year: num(v.year),
    typeId: v.typeId || null,
    facultyId: v.facultyId || null,
    studyProgramId: v.studyProgramId || null,
    categoryIds: v.categoryIds,
    leadResearcherId: v.lead?.id ?? null,
    memberResearcherIds: v.members.map((m) => m.id),
    publications: v.publications
      .filter((p) => Object.values(p).some((x) => x.trim() !== ""))
      .map((p) => ({ title: p.title, url: text(p.url), doi: text(p.doi), venue: text(p.venue), year: num(p.year) })),
    intellectualProperties: v.intellectualProperties
      .filter((p) => [p.status, p.registrationNumber, p.year, p.notes].some((x) => x.trim() !== ""))
      .map((p) => ({
        kind: p.kind,
        status: text(p.status),
        registrationNumber: text(p.registrationNumber),
        year: num(p.year),
        notes: text(p.notes),
      })),
  };
}

/** Nama field API -> id field di formulir (untuk pesan galat dan fokus). */
function formPath(apiField: string): string {
  if (apiField === "leadResearcherId") return "lead";
  if (apiField.startsWith("memberResearcherIds")) return "members";
  return apiField;
}

export function InnovationForm({
  csrf,
  mode,
  id,
  initial,
  refs,
  revisionNote,
  scope = "researcher",
  status,
}: {
  csrf: string;
  mode: "create" | "edit";
  id?: string;
  initial: FormValues;
  refs: FormRefs;
  revisionNote?: string | null;
  /** operator: operator menginput dan menerbitkan langsung (ADR-008). researcher: alur pengajuan dosen lama (flag RESEARCHER_PORTAL). */
  scope?: "operator" | "researcher";
  /** Status tersimpan. Inovasi yang sudah terbit tidak punya tombol Terbitkan; perubahan langsung tampil di publik. */
  status?: string;
}) {
  const router = useRouter();
  const operator = scope === "operator";
  const alreadyPublished = operator && status === "published";
  const apiBase = operator ? "/api/v1/admin/innovations" : "/api/v1/me/innovations";
  const pageBase = operator ? "/admin/inovasi" : "/dosen/inovasi";
  const searchPath = operator ? "/api/v1/admin/researchers" : "/api/v1/me/researchers";
  const [v, setV] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const programs = refs.studyPrograms.filter((p) => !v.facultyId || p.facultyId === v.facultyId);
  const missing = missingForSubmission({
    title: v.title,
    summary: v.summary,
    categoryIds: v.categoryIds,
    leadResearcherId: v.lead?.id ?? null,
  });

  function showErrors(message: string, details: { field: string; message: string }[]) {
    const next: Record<string, string> = {};
    for (const d of details) next[formPath(d.field)] ??= d.message;
    setErrors(next);
    setBanner(message);
    // Fokus ke ringkasan galat agar pembaca layar dan keyboard langsung diarahkan ke masalahnya.
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  /** Menyimpan sebagai draft. Mengembalikan id inovasi bila berhasil. */
  async function persist(): Promise<string | null> {
    setErrors({});
    setBanner(null);
    const body = toPayload(v);
    const result =
      mode === "create" && !id
        ? await apiRequest<{ id: string }>("POST", apiBase, { csrf, body })
        : await apiRequest<{ id: string }>("PATCH", `${apiBase}/${id}`, { csrf, body });
    if (!result.ok) {
      showErrors(result.message, result.details);
      return null;
    }
    setDirty(false);
    setSavedAt(new Date());
    return result.data.id;
  }

  async function saveDraft() {
    setBusy("save");
    const savedId = await persist();
    setBusy(null);
    if (savedId && mode === "create") {
      router.replace(`${pageBase}/${savedId}/edit`);
    } else if (savedId) {
      router.refresh();
    }
  }

  async function submit() {
    setBusy("submit");
    const savedId = await persist();
    if (!savedId) return setBusy(null);
    const result = operator
      ? await apiRequest("POST", `${apiBase}/${savedId}/transitions`, { csrf, body: { to: "published" } })
      : await apiRequest("POST", `${apiBase}/${savedId}/submit`, { csrf });
    if (!result.ok) {
      showErrors(result.message, result.details);
      setBusy(null);
      return;
    }
    router.push(`${pageBase}/${savedId}`);
    router.refresh();
  }

  function patchRow<K extends "publications" | "intellectualProperties">(
    key: K,
    index: number,
    patch: Partial<FormValues[K][number]>,
  ) {
    set(key, v[key].map((row, i) => (i === index ? { ...row, ...patch } : row)) as FormValues[K]);
  }

  const errorList = Object.entries(errors);
  const e = (path: string) => errors[path];

  return (
    <form onSubmit={(ev) => ev.preventDefault()} noValidate className="space-y-10">
      {revisionNote ? (
        <div role="note" className="flex gap-3 rounded-card border border-border bg-status-revision-bg p-4 text-status-revision-fg">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Operator meminta revisi</p>
            <p className="mt-1 whitespace-pre-line">{revisionNote}</p>
          </div>
        </div>
      ) : null}

      {errorList.length > 0 || banner ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-card border border-destructive bg-surface p-4 text-sm"
        >
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

      <Section n={1} title="Identitas">
        <Field path="title" label="Judul" required error={e("title")} hint="5 sampai 200 karakter.">
          {(p) => (
            <TextInput {...p} value={v.title} onChange={(x) => set("title", x.target.value)} maxLength={200} error={e("title")} />
          )}
        </Field>
        <Field
          path="summary"
          label="Ringkasan"
          error={e("summary")}
          hint="Boleh dikosongkan saat draft, tetapi wajib sebelum terbit. 20 sampai 500 karakter. Tampil di kartu katalog, jadi tulis yang paling penting."
        >
          {(p) => (
            <TextArea {...p} value={v.summary} onChange={(x) => set("summary", x.target.value)} maxLength={500} rows={4} error={e("summary")} />
          )}
        </Field>

        <fieldset aria-describedby={e("categoryIds") ? "f-categoryIds-error" : undefined}>
          <legend className="text-sm font-semibold">
            Kategori
            <span aria-hidden="true" className="text-destructive">
              {" "}
              *
            </span>
            <span className="sr-only"> (wajib, pilih minimal satu)</span>
          </legend>
          {refs.categories.length === 0 ? (
            <p id={fieldId("categoryIds")} className="mt-2 text-sm text-muted-foreground">
              {operator
                ? "Daftar kategori masih kosong. Tambahkan dulu di menu Data acuan. Draft tetap dapat disimpan."
                : "Daftar kategori belum diisi oleh operator, sehingga inovasi belum dapat diajukan. Draft tetap dapat disimpan."}
            </p>
          ) : (
            <div id={fieldId("categoryIds")} tabIndex={-1} className="mt-2 grid gap-2 sm:grid-cols-2">
              {refs.categories.map((c) => (
                <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border-input bg-surface px-3">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-primary)]"
                    checked={v.categoryIds.includes(c.id)}
                    onChange={(x) =>
                      set("categoryIds", x.target.checked ? [...v.categoryIds, c.id] : v.categoryIds.filter((i) => i !== c.id))
                    }
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          )}
          {e("categoryIds") ? (
            <p id="f-categoryIds-error" className="mt-1 text-sm font-medium text-destructive">
              {e("categoryIds")}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field path="typeId" label="Jenis inovasi" error={e("typeId")}>
            {(p) => (
              <SelectInput {...p} value={v.typeId} onChange={(x) => set("typeId", x.target.value)} error={e("typeId")}>
                <option value="">Pilih jenis (opsional)</option>
                {refs.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field path="year" label="Tahun" error={e("year")} hint="Tahun penelitian atau inovasi dihasilkan.">
            {(p) => (
              <TextInput
                {...p}
                type="number"
                inputMode="numeric"
                min={1900}
                max={2100}
                value={v.year}
                onChange={(x) => set("year", x.target.value)}
                error={e("year")}
              />
            )}
          </Field>
          <Field path="facultyId" label="Fakultas" error={e("facultyId")}>
            {(p) => (
              <SelectInput
                {...p}
                value={v.facultyId}
                onChange={(x) => {
                  const facultyId = x.target.value;
                  setV((prev) => ({
                    ...prev,
                    facultyId,
                    studyProgramId: refs.studyPrograms.some((s) => s.id === prev.studyProgramId && s.facultyId === facultyId)
                      ? prev.studyProgramId
                      : "",
                  }));
                  setDirty(true);
                }}
                error={e("facultyId")}
              >
                <option value="">Pilih fakultas (opsional)</option>
                {refs.faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field path="studyProgramId" label="Program studi" error={e("studyProgramId")}>
            {(p) => (
              <SelectInput
                {...p}
                value={v.studyProgramId}
                onChange={(x) => set("studyProgramId", x.target.value)}
                error={e("studyProgramId")}
              >
                <option value="">Pilih program studi (opsional)</option>
                {programs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
      </Section>

      <Section n={2} title="Tim peneliti">
        <ResearcherPicker
          inputId={fieldId("lead")}
          searchPath={searchPath}
          label="Ketua peneliti (wajib)"
          multiple={false}
          selected={v.lead ? [v.lead] : []}
          onChange={(next) => set("lead", next[0] ?? null)}
          excludeIds={v.members.map((m) => m.id)}
          error={e("lead")}
          hint={operator ? "Cari nama peneliti. Belum ada? Tambahkan dulu di menu Peneliti." : "Biasanya Anda sendiri. Cari nama bila ketuanya orang lain."}
        />
        <ResearcherPicker
          inputId={fieldId("members")}
          searchPath={searchPath}
          label="Anggota tim"
          multiple
          selected={v.members}
          onChange={(next) => set("members", next)}
          excludeIds={v.lead ? [v.lead.id] : []}
          error={e("members")}
          hint={operator ? "Opsional. Cari nama peneliti yang sudah ada di menu Peneliti." : "Anggota tim dapat melihat pengajuan ini tetapi tidak dapat mengubahnya."}
        />
      </Section>

      <Section n={3} title="Uraian" hint="Semua bagian ini opsional. Bagian yang kosong tidak ditampilkan di halaman publik.">
        {LONG_TEXTS.map((f) => (
          <Field key={f.key} path={f.key} label={f.label} error={e(f.key)}>
            {(p) => (
              <TextArea {...p} value={v[f.key]} onChange={(x) => set(f.key, x.target.value)} maxLength={f.max} rows={f.rows} error={e(f.key)} />
            )}
          </Field>
        ))}
      </Section>

      <Section n={4} title="Publikasi dan kekayaan intelektual">
        <Repeater
          title="Publikasi"
          addLabel="Tambah publikasi"
          items={v.publications}
          onAdd={() => set("publications", [...v.publications, { title: "", url: "", doi: "", venue: "", year: "" }])}
          onRemove={(i) => set("publications", v.publications.filter((_, idx) => idx !== i))}
          render={(item, i) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field path={`publications.${i}.title`} label="Judul publikasi" error={e(`publications.${i}.title`)}>
                  {(p) => (
                    <TextInput {...p} value={item.title} maxLength={300} onChange={(x) => patchRow("publications", i, { title: x.target.value })} error={e(`publications.${i}.title`)} />
                  )}
                </Field>
              </div>
              <Field path={`publications.${i}.url`} label="Tautan" error={e(`publications.${i}.url`)} hint="Diawali http:// atau https://">
                {(p) => (
                  <TextInput {...p} type="url" value={item.url} maxLength={2048} onChange={(x) => patchRow("publications", i, { url: x.target.value })} error={e(`publications.${i}.url`)} />
                )}
              </Field>
              <Field path={`publications.${i}.doi`} label="DOI" error={e(`publications.${i}.doi`)}>
                {(p) => (
                  <TextInput {...p} value={item.doi} maxLength={200} onChange={(x) => patchRow("publications", i, { doi: x.target.value })} error={e(`publications.${i}.doi`)} />
                )}
              </Field>
              <Field path={`publications.${i}.venue`} label="Penerbit / jurnal" error={e(`publications.${i}.venue`)}>
                {(p) => (
                  <TextInput {...p} value={item.venue} maxLength={300} onChange={(x) => patchRow("publications", i, { venue: x.target.value })} error={e(`publications.${i}.venue`)} />
                )}
              </Field>
              <Field path={`publications.${i}.year`} label="Tahun terbit" error={e(`publications.${i}.year`)}>
                {(p) => (
                  <TextInput {...p} type="number" inputMode="numeric" min={1900} max={2100} value={item.year} onChange={(x) => patchRow("publications", i, { year: x.target.value })} error={e(`publications.${i}.year`)} />
                )}
              </Field>
            </div>
          )}
        />

        <Repeater
          title="HKI / Paten"
          addLabel="Tambah HKI / paten"
          items={v.intellectualProperties}
          onAdd={() =>
            set("intellectualProperties", [
              ...v.intellectualProperties,
              { kind: "hki", status: "", registrationNumber: "", year: "", notes: "" },
            ])
          }
          onRemove={(i) => set("intellectualProperties", v.intellectualProperties.filter((_, idx) => idx !== i))}
          render={(item, i) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field path={`intellectualProperties.${i}.kind`} label="Jenis" error={e(`intellectualProperties.${i}.kind`)}>
                {(p) => (
                  <SelectInput {...p} value={item.kind} onChange={(x) => patchRow("intellectualProperties", i, { kind: x.target.value as typeof item.kind })}>
                    <option value="hki">HKI</option>
                    <option value="paten">Paten</option>
                    <option value="lainnya">Lainnya</option>
                  </SelectInput>
                )}
              </Field>
              <Field path={`intellectualProperties.${i}.status`} label="Status" error={e(`intellectualProperties.${i}.status`)} hint="Mis. terdaftar atau granted.">
                {(p) => (
                  <TextInput {...p} value={item.status} maxLength={100} onChange={(x) => patchRow("intellectualProperties", i, { status: x.target.value })} error={e(`intellectualProperties.${i}.status`)} />
                )}
              </Field>
              <Field path={`intellectualProperties.${i}.registrationNumber`} label="Nomor pendaftaran" error={e(`intellectualProperties.${i}.registrationNumber`)}>
                {(p) => (
                  <TextInput {...p} value={item.registrationNumber} maxLength={100} onChange={(x) => patchRow("intellectualProperties", i, { registrationNumber: x.target.value })} error={e(`intellectualProperties.${i}.registrationNumber`)} />
                )}
              </Field>
              <Field path={`intellectualProperties.${i}.year`} label="Tahun" error={e(`intellectualProperties.${i}.year`)}>
                {(p) => (
                  <TextInput {...p} type="number" inputMode="numeric" min={1900} max={2100} value={item.year} onChange={(x) => patchRow("intellectualProperties", i, { year: x.target.value })} error={e(`intellectualProperties.${i}.year`)} />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field path={`intellectualProperties.${i}.notes`} label="Catatan" error={e(`intellectualProperties.${i}.notes`)}>
                  {(p) => (
                    <TextInput {...p} value={item.notes} maxLength={1000} onChange={(x) => patchRow("intellectualProperties", i, { notes: x.target.value })} error={e(`intellectualProperties.${i}.notes`)} />
                  )}
                </Field>
              </div>
            </div>
          )}
        />
      </Section>

      <Section n={5} title="Tinjau dan ajukan">
        <p className="text-muted-foreground">
          Unggah gambar dan dokumen pendukung belum tersedia; fitur ini menyusul. Pengajuan yang sudah lengkap akan
          diperiksa operator sebelum tampil di katalog.
        </p>
        <ul className="space-y-2" aria-label="Kelengkapan pengajuan">
          {[
            { field: "title", label: "Judul diisi" },
            { field: "summary", label: "Ringkasan diisi" },
            { field: "categoryIds", label: "Minimal satu kategori dipilih" },
            { field: "leadResearcherId", label: "Ketua peneliti dipilih" },
          ].map((item) => {
            const ok = !missing.some((m) => m.field === item.field);
            return (
              <li key={item.field} className="flex items-center gap-2">
                {ok ? (
                  <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
                <span>
                  {item.label}
                  <span className="sr-only">{ok ? " — terpenuhi" : " — belum terpenuhi"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {busy === "save"
            ? "Menyimpan…"
            : dirty
              ? "Perubahan belum disimpan."
              : savedAt
                ? `Tersimpan pukul ${savedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}.`
                : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy !== null}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-primary px-5 font-semibold text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="size-5" aria-hidden="true" />
            {alreadyPublished ? "Simpan perubahan" : "Simpan draft"}
          </button>
          {alreadyPublished ? null : (
          <button
            type="button"
            onClick={submit}
            disabled={busy !== null || missing.length > 0}
            aria-describedby={missing.length > 0 ? "alasan-ajukan" : undefined}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {operator ? <Globe className="size-5" aria-hidden="true" /> : <Send className="size-5" aria-hidden="true" />}
            {busy === "submit" ? (operator ? "Menerbitkan…" : "Mengajukan…") : operator ? "Terbitkan" : "Ajukan"}
          </button>
          )}
        </div>
        {missing.length > 0 && !alreadyPublished ? (
          <p id="alasan-ajukan" className="basis-full text-sm text-muted-foreground">
            Tombol {operator ? "Terbitkan" : "Ajukan"} aktif setelah lengkap: {missing.map((m) => m.message.replace(/\.$/, "").toLowerCase()).join("; ")}.
          </p>
        ) : null}
      </div>
    </form>
  );

}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`bagian-${n}`} className="rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 id={`bagian-${n}`} className="text-xl font-semibold">
        <span className="mr-2 text-muted-foreground">{n}.</span>
        {title}
      </h2>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Repeater<T>({
  title,
  addLabel,
  items,
  onAdd,
  onRemove,
  render,
}: {
  title: string;
  addLabel: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  render: (item: T, index: number) => React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      {items.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Belum ada. Opsional.</p> : null}
      <ul className="mt-3 space-y-4">
        {items.map((item, i) => (
          <li key={i} className="rounded-control border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-muted-foreground">
                {title} {i + 1}
              </p>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-control px-3 text-sm font-semibold text-destructive hover:bg-background"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Hapus<span className="sr-only"> {title} {i + 1}</span>
              </button>
            </div>
            {render(item, i)}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border-input px-4 font-semibold hover:bg-primary-tint"
      >
        <Plus className="size-5" aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}
