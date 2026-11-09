import { and, count, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { can, type AuthUser } from "@/modules/auth/authorize";
import { escapeLike } from "@/modules/catalog/pg-provider";
import {
  failure,
  NOT_FOUND,
  runService,
  type ServiceResult,
  type Tx,
} from "@/modules/innovations/service-core";
import { uniqueSlug } from "@/modules/innovations/slug";
import { recordAudit } from "@/platform/audit/audit";
import type { Database } from "@/platform/db/client";
import { faculties, innovationMembers, innovations, researchers, studyPrograms } from "@/platform/db/schema";
import { z } from "@/platform/http/zod";
import { safeExternalLinks } from "./pg-provider";

/**
 * Pengelolaan data peneliti oleh operator (ADR-008). Peneliti adalah data, bukan akun: diketik dari
 * berkas fisik dosen. NIDN/NIP sengaja tidak diterima di sini (OQ-28, minimisasi data).
 */

export interface AdminResearcherListItem {
  id: string;
  slug: string;
  fullName: string;
  position: string | null;
  facultyName: string | null;
  isPublic: boolean;
  /** Jumlah inovasi (apa pun statusnya, belum dihapus) yang mencantumkan peneliti ini. */
  innovationCount: number;
}

export interface AdminResearcher {
  id: string;
  slug: string;
  fullName: string;
  position: string | null;
  bio: string | null;
  facultyId: string | null;
  studyProgramId: string | null;
  externalLinks: { label: string; url: string }[];
  isPublic: boolean;
  innovationCount: number;
  createdAt: string;
  updatedAt: string;
}

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

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const linkSchema = z.strictObject({
  label: z.string().trim().min(1, "Label tautan wajib diisi.").max(40, "Label maksimal 40 karakter."),
  url: httpUrl,
});

const base = {
  fullName: z.string().trim().min(2, "Nama minimal 2 karakter.").max(150, "Nama maksimal 150 karakter."),
  position: optionalText(150),
  bio: optionalText(3000),
  facultyId: z.uuid("Fakultas tidak valid.").nullable().optional(),
  studyProgramId: z.uuid("Program studi tidak valid.").nullable().optional(),
  externalLinks: z.array(linkSchema).max(5, "Maksimal 5 tautan.").optional(),
  isPublic: z.boolean().optional(),
};

// strictObject menolak field tak dikenal, termasuk userId, slug, dan identifier (NIDN/NIP).
const createSchema = z.strictObject(base);
const patchSchema = z.strictObject(base).partial();

const deleteSchema = z.strictObject({
  reason: z.string().trim().min(3, "Alasan minimal 3 karakter.").max(500, "Alasan maksimal 500 karakter."),
});

const uuid = z.uuid();

const issues = (error: z.ZodError) =>
  error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message }));

export function createAdminResearcherService(db: Database, hooks: { onPublicChange?: () => void } = {}) {
  const run = <T,>(fn: (tx: Tx) => Promise<T>): Promise<ServiceResult<T>> => runService(db, fn);

  /** 404 untuk yang tidak berhak, supaya keberadaan data tidak bocor (konsisten dengan layanan admin lain). */
  function requireManage(actor: AuthUser) {
    if (!can(actor, "researcher.manage")) NOT_FOUND();
  }

  async function usageCount(tx: Tx, researcherId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(innovationMembers)
      .innerJoin(innovations, eq(innovations.id, innovationMembers.innovationId))
      .where(and(eq(innovationMembers.researcherId, researcherId), isNull(innovations.deletedAt)));
    return row.n;
  }

  /** Program studi harus ada dan, bila fakultas juga dipilih, milik fakultas itu. */
  async function checkAffiliation(tx: Tx, facultyId: string | null | undefined, studyProgramId: string | null | undefined) {
    if (facultyId) {
      const [f] = await tx.select({ id: faculties.id }).from(faculties).where(eq(faculties.id, facultyId));
      if (!f) failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", [{ field: "facultyId", message: "Fakultas tidak ditemukan." }]);
    }
    if (studyProgramId) {
      const [sp] = await tx
        .select({ facultyId: studyPrograms.facultyId })
        .from(studyPrograms)
        .where(eq(studyPrograms.id, studyProgramId));
      if (!sp) {
        failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", [{ field: "studyProgramId", message: "Program studi tidak ditemukan." }]);
      }
      if (facultyId && sp!.facultyId !== facultyId) {
        failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", [
          { field: "studyProgramId", message: "Program studi bukan bagian dari fakultas yang dipilih." },
        ]);
      }
    }
  }

  const toLinksRecord = (links: { label: string; url: string }[]) => Object.fromEntries(links.map((l) => [l.label, l.url]));

  async function load(tx: Tx, id: string): Promise<AdminResearcher> {
    if (!uuid.safeParse(id).success) NOT_FOUND();
    const [row] = await tx
      .select()
      .from(researchers)
      .where(and(eq(researchers.id, id), isNull(researchers.deletedAt)));
    if (!row) NOT_FOUND();
    return {
      id: row!.id,
      slug: row!.slug,
      fullName: row!.fullName,
      position: row!.position,
      bio: row!.bio,
      facultyId: row!.facultyId,
      studyProgramId: row!.studyProgramId,
      externalLinks: safeExternalLinks(row!.externalLinks),
      isPublic: row!.isPublic,
      innovationCount: await usageCount(tx, row!.id),
      createdAt: row!.createdAt.toISOString(),
      updatedAt: row!.updatedAt.toISOString(),
    };
  }

  return {
    async list(
      actor: AuthUser,
      options: { q?: string; page: number; perPage: number },
    ): Promise<ServiceResult<{ items: AdminResearcherListItem[]; total: number }>> {
      return run(async (tx) => {
        requireManage(actor);
        const where = and(
          isNull(researchers.deletedAt),
          options.q ? ilike(researchers.fullName, `%${escapeLike(options.q)}%`) : undefined,
        );
        const rows = await tx
          .select({
            id: researchers.id,
            slug: researchers.slug,
            fullName: researchers.fullName,
            position: researchers.position,
            facultyName: faculties.name,
            isPublic: researchers.isPublic,
            innovationCount: sql<number>`(select count(*)::int from ${innovationMembers} m
              join ${innovations} i on i.id = m.innovation_id
              where m.researcher_id = ${researchers.id} and i.deleted_at is null)`,
          })
          .from(researchers)
          .leftJoin(faculties, eq(faculties.id, researchers.facultyId))
          .where(where)
          // Yang terbaru ditambahkan di atas: operator biasanya sedang mengisi dari tumpukan berkas.
          .orderBy(desc(researchers.createdAt), desc(researchers.id))
          .limit(options.perPage)
          .offset((options.page - 1) * options.perPage);
        const [total] = await tx.select({ n: count() }).from(researchers).where(where);
        return { items: rows, total: total.n };
      });
    },

    async get(actor: AuthUser, id: string): Promise<ServiceResult<AdminResearcher>> {
      return run(async (tx) => {
        requireManage(actor);
        return load(tx, id);
      });
    },

    async create(actor: AuthUser, rawInput: unknown): Promise<ServiceResult<AdminResearcher>> {
      const result = await run(async (tx) => {
        requireManage(actor);
        const parsed = createSchema.safeParse(rawInput);
        if (!parsed.success) return failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", issues(parsed.error));
        const input = parsed.data;
        await checkAffiliation(tx, input.facultyId, input.studyProgramId);

        const slug = await uniqueSlug(input.fullName, async (candidate) => {
          const [hit] = await tx.select({ id: researchers.id }).from(researchers).where(eq(researchers.slug, candidate));
          return Boolean(hit);
        });
        const [row] = await tx
          .insert(researchers)
          .values({
            slug,
            fullName: input.fullName,
            position: input.position ?? null,
            bio: input.bio ?? null,
            facultyId: input.facultyId ?? null,
            studyProgramId: input.studyProgramId ?? null,
            externalLinks: input.externalLinks?.length ? toLinksRecord(input.externalLinks) : null,
            isPublic: input.isPublic ?? true,
          })
          .returning({ id: researchers.id });
        await recordAudit(tx, { actorId: actor.id, action: "researcher.create", entityType: "researcher", entityId: row.id });
        return load(tx, row.id);
      });
      if (result.ok) hooks.onPublicChange?.();
      return result;
    },

    async update(actor: AuthUser, id: string, rawPatch: unknown): Promise<ServiceResult<AdminResearcher>> {
      const result = await run(async (tx) => {
        requireManage(actor);
        const current = await load(tx, id);
        const parsed = patchSchema.safeParse(rawPatch);
        if (!parsed.success) return failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", issues(parsed.error));
        const patch = parsed.data;

        // Validasi gabungan: nilai baru menimpa nilai lama, lalu keserasian fakultas-prodi dicek utuh.
        const facultyId = patch.facultyId !== undefined ? patch.facultyId : current.facultyId;
        const studyProgramId = patch.studyProgramId !== undefined ? patch.studyProgramId : current.studyProgramId;
        await checkAffiliation(tx, facultyId, studyProgramId);

        const set: Partial<typeof researchers.$inferInsert> = {};
        if (patch.fullName !== undefined) set.fullName = patch.fullName;
        if (patch.position !== undefined) set.position = patch.position;
        if (patch.bio !== undefined) set.bio = patch.bio;
        if (patch.facultyId !== undefined) set.facultyId = patch.facultyId;
        if (patch.studyProgramId !== undefined) set.studyProgramId = patch.studyProgramId;
        if (patch.isPublic !== undefined) set.isPublic = patch.isPublic;
        if (patch.externalLinks !== undefined) {
          set.externalLinks = patch.externalLinks.length ? toLinksRecord(patch.externalLinks) : null;
        }
        // Slug sengaja tetap: URL profil yang sudah beredar tidak boleh putus.
        await tx
          .update(researchers)
          .set(Object.keys(set).length ? set : { updatedAt: new Date() })
          .where(eq(researchers.id, id));
        await recordAudit(tx, {
          actorId: actor.id,
          action: "researcher.update",
          entityType: "researcher",
          entityId: id,
          changes: { fields: Object.keys(patch) },
        });
        return load(tx, id);
      });
      if (result.ok) hooks.onPublicChange?.();
      return result;
    },

    /** Hapus lunak. Ditolak bila masih tercantum di inovasi, supaya tim inovasi tidak kehilangan ketua/anggota diam-diam. */
    async remove(actor: AuthUser, id: string, rawInput: unknown): Promise<ServiceResult<{ deleted: true }>> {
      const result = await run(async (tx) => {
        requireManage(actor);
        await load(tx, id);
        const parsed = deleteSchema.safeParse(rawInput);
        if (!parsed.success) return failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", issues(parsed.error));
        const used = await usageCount(tx, id);
        if (used > 0) {
          failure("CONFLICT", `Peneliti masih tercantum di ${used} inovasi. Lepaskan dari inovasi itu terlebih dulu.`);
        }
        await tx.update(researchers).set({ deletedAt: new Date() }).where(eq(researchers.id, id));
        await recordAudit(tx, {
          actorId: actor.id,
          action: "researcher.delete",
          entityType: "researcher",
          entityId: id,
          changes: { reason: parsed.data.reason },
        });
        return { deleted: true as const };
      });
      if (result.ok) hooks.onPublicChange?.();
      return result;
    },
  };
}

export type AdminResearcherService = ReturnType<typeof createAdminResearcherService>;
