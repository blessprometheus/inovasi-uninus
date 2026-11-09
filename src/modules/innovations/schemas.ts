import { z } from "../../platform/http/zod";

/**
 * Validasi input inovasi. Aturan field wajib/opsional: docs/PRD.md FR-03 dan
 * docs/DATABASE_DESIGN.md §4.3. Teks panjang adalah teks biasa (ADR-006), dirender sebagai teks.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const httpUrl = z
  .string()
  .trim()
  .max(2048, "Tautan terlalu panjang.")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Tautan harus diawali http:// atau https://");

const year = z
  .number()
  .int("Tahun harus bilangan bulat.")
  .min(1900, "Tahun tidak valid.")
  .max(2100, "Tahun tidak valid.");

export const publicationInputSchema = z
  .object({
    title: z.string().trim().min(1, "Judul publikasi wajib diisi.").max(300),
    url: httpUrl.nullable().optional(),
    doi: optionalText(200),
    venue: optionalText(300),
    year: year.nullable().optional(),
  })
  .strict();

export const intellectualPropertyInputSchema = z
  .object({
    kind: z.enum(["hki", "paten", "lainnya"], "Jenis kekayaan intelektual tidak valid."),
    status: optionalText(100),
    registrationNumber: optionalText(100),
    year: year.nullable().optional(),
    notes: optionalText(1000),
  })
  .strict();

/**
 * Draft cukup berisi judul. Ringkasan boleh kosong (disimpan sebagai teks kosong, kolomnya NOT NULL)
 * tetapi bila diisi minimal 20 karakter. Ringkasan wajib ada sebelum terbit (missingForSubmission),
 * karena kartu katalog menampilkannya.
 */
const innovationBaseSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, "Judul minimal 5 karakter.")
      .max(200, "Judul maksimal 200 karakter."),
    summary: z
      .string()
      .trim()
      .max(500, "Ringkasan maksimal 500 karakter.")
      .refine((v) => v === "" || v.length >= 20, "Ringkasan minimal 20 karakter.")
      .optional(),
    abstract: optionalText(5000),
    background: optionalText(5000),
    problemStatement: optionalText(5000),
    objective: optionalText(5000),
    methodology: optionalText(5000),
    description: optionalText(10000),
    advantages: optionalText(5000),
    benefits: optionalText(5000),
    developmentPotential: optionalText(5000),
    year: year.nullable().optional(),
    typeId: z.uuid("Jenis inovasi tidak valid.").nullable().optional(),
    facultyId: z.uuid("Fakultas tidak valid.").nullable().optional(),
    studyProgramId: z.uuid("Program studi tidak valid.").nullable().optional(),
    categoryIds: z.array(z.uuid("Kategori tidak valid.")).max(10, "Maksimal 10 kategori.").optional(),
    leadResearcherId: z.uuid("Ketua peneliti tidak valid.").nullable().optional(),
    memberResearcherIds: z.array(z.uuid("Anggota tidak valid.")).max(30, "Maksimal 30 anggota.").optional(),
    publications: z.array(publicationInputSchema).max(30).optional(),
    intellectualProperties: z.array(intellectualPropertyInputSchema).max(10).optional(),
  })
  // .strict() menolak field tak dikenal, termasuk status/submittedBy/slug yang tidak boleh dikirim klien.
  .strict();

/** Aturan antar-field tim peneliti. Dipisah karena Zod tidak mengizinkan .partial() pada schema ber-refinement. */
function checkTeam(
  v: { leadResearcherId?: string | null; memberResearcherIds?: string[] },
  ctx: z.RefinementCtx,
) {
  if (v.leadResearcherId && v.memberResearcherIds?.includes(v.leadResearcherId)) {
    ctx.addIssue({
      code: "custom",
      path: ["memberResearcherIds"],
      message: "Ketua tidak boleh juga terdaftar sebagai anggota.",
    });
  }
  if (new Set(v.memberResearcherIds ?? []).size !== (v.memberResearcherIds ?? []).length) {
    ctx.addIssue({
      code: "custom",
      path: ["memberResearcherIds"],
      message: "Anggota tidak boleh duplikat.",
    });
  }
}

export const innovationDraftSchema = innovationBaseSchema.superRefine(checkTeam);

export type InnovationDraftInput = z.infer<typeof innovationDraftSchema>;

/** Pembaruan parsial (PATCH): semua field opsional, tetapi aturan tiap field tetap berlaku. */
export const innovationPatchSchema = innovationBaseSchema.partial().superRefine(checkTeam);

export { missingForSubmission, type MissingField, type SubmissionSubject } from "./submission";
