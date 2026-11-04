/**
 * Daftar kelengkapan untuk mengajukan (docs/WORKFLOW.md §2). Tanpa dependensi supaya aman
 * dipakai di browser (formulir) sekaligus di server (layanan) dengan aturan yang persis sama.
 */
/** Syarat kelengkapan untuk mengajukan (WORKFLOW.md §2: judul, ringkasan, kategori, ketua peneliti). */
export interface SubmissionSubject {
  title?: string | null;
  summary?: string | null;
  categoryIds?: readonly string[] | null;
  leadResearcherId?: string | null;
}

export interface MissingField {
  field: string;
  message: string;
}

export function missingForSubmission(subject: SubmissionSubject): MissingField[] {
  const missing: MissingField[] = [];
  if (!subject.title?.trim()) missing.push({ field: "title", message: "Judul wajib diisi." });
  if (!subject.summary?.trim()) missing.push({ field: "summary", message: "Ringkasan wajib diisi." });
  if (!subject.categoryIds?.length) {
    missing.push({ field: "categoryIds", message: "Pilih minimal satu kategori." });
  }
  if (!subject.leadResearcherId) {
    missing.push({ field: "leadResearcherId", message: "Ketua peneliti wajib dipilih." });
  }
  return missing;
}
