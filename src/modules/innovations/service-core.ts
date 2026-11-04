import { and, asc, desc, eq } from "drizzle-orm";
import type { InnovationStatus } from "@/modules/workflow/transitions";
import type { Database } from "@/platform/db/client";
import {
  innovationCategories,
  innovationMembers,
  innovations,
  intellectualProperties,
  publications,
  statusHistories,
} from "@/platform/db/schema";
import type { ApiErrorCode, ApiErrorDetail } from "@/platform/http/response";

export type ServiceError = { ok: false; code: ApiErrorCode; message: string; details?: ApiErrorDetail[] };
export type ServiceResult<T> = { ok: true; data: T } | ServiceError;

/** Dilempar di dalam transaksi supaya perubahan dibatalkan, lalu diubah kembali jadi ServiceError. */
export class ServiceFailure extends Error {
  constructor(readonly error: ServiceError) {
    super(error.message);
  }
}

export const failure = (code: ApiErrorCode, message: string, details?: ApiErrorDetail[]): never => {
  throw new ServiceFailure({ ok: false, code, message, ...(details ? { details } : {}) });
};

export const NOT_FOUND = () => failure("NOT_FOUND", "Data tidak ditemukan.");

export interface OwnInnovation {
  id: string;
  slug: string;
  status: InnovationStatus;
  isOwner: boolean;
  title: string;
  summary: string;
  abstract: string | null;
  background: string | null;
  problemStatement: string | null;
  objective: string | null;
  methodology: string | null;
  description: string | null;
  advantages: string | null;
  benefits: string | null;
  developmentPotential: string | null;
  year: number | null;
  typeId: string | null;
  facultyId: string | null;
  studyProgramId: string | null;
  categoryIds: string[];
  leadResearcherId: string | null;
  memberResearcherIds: string[];
  publications: { title: string; url: string | null; doi: string | null; venue: string | null; year: number | null }[];
  intellectualProperties: {
    kind: "hki" | "paten" | "lainnya";
    status: string | null;
    registrationNumber: string | null;
    year: number | null;
    notes: string | null;
  }[];
  /** Catatan revisi terakhir dari operator, hanya bila status revision_required. */
  revisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistoryItem {
  fromStatus: InnovationStatus | null;
  toStatus: InnovationStatus;
  note: string | null;
  createdAt: string;
}

export function pgError(error: unknown): { code?: string; constraint?: string } {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return { code: e?.cause?.code ?? e?.code, constraint: e?.cause?.constraint ?? e?.constraint };
}

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Tx;

export async function currentTeam(x: Executor, innovationId: string) {
  const rows = await x
    .select({ researcherId: innovationMembers.researcherId, role: innovationMembers.role })
    .from(innovationMembers)
    .where(eq(innovationMembers.innovationId, innovationId))
    .orderBy(asc(innovationMembers.sortOrder));
  return {
    lead: rows.find((r) => r.role === "lead")?.researcherId ?? null,
    members: rows.filter((r) => r.role === "member").map((r) => r.researcherId),
  };
}

export async function toOwnInnovation(
  x: Executor,
  row: typeof innovations.$inferSelect,
  isOwner: boolean,
): Promise<OwnInnovation> {
  // Berurutan: satu transaksi = satu koneksi, dan pg melarang query paralel pada koneksi yang sama.
  const cats = await x
    .select({ id: innovationCategories.categoryId })
    .from(innovationCategories)
    .where(eq(innovationCategories.innovationId, row.id));
  const team = await currentTeam(x, row.id);
  const pubs = await x.select().from(publications).where(eq(publications.innovationId, row.id)).orderBy(asc(publications.sortOrder));
  const ips = await x
    .select()
    .from(intellectualProperties)
    .where(eq(intellectualProperties.innovationId, row.id))
    .orderBy(asc(intellectualProperties.createdAt));
  const note =
    row.status === "revision_required"
      ? await x
          .select({ note: statusHistories.note })
          .from(statusHistories)
          .where(and(eq(statusHistories.innovationId, row.id), eq(statusHistories.toStatus, "revision_required")))
          .orderBy(desc(statusHistories.createdAt))
          .limit(1)
      : [];
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    isOwner,
    title: row.title,
    summary: row.summary,
    abstract: row.abstract,
    background: row.background,
    problemStatement: row.problemStatement,
    objective: row.objective,
    methodology: row.methodology,
    description: row.description,
    advantages: row.advantages,
    benefits: row.benefits,
    developmentPotential: row.developmentPotential,
    year: row.year,
    typeId: row.typeId,
    facultyId: row.facultyId,
    studyProgramId: row.studyProgramId,
    categoryIds: cats.map((c) => c.id),
    leadResearcherId: team.lead,
    memberResearcherIds: team.members,
    publications: pubs.map((p) => ({ title: p.title, url: p.url, doi: p.doi, venue: p.venue, year: p.year })),
    intellectualProperties: ips.map((p) => ({
      kind: p.kind,
      status: p.status,
      registrationNumber: p.registrationNumber,
      year: p.year,
      notes: p.notes,
    })),
    revisionNote: note[0]?.note ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Menjalankan blok dalam transaksi dan mengubah kegagalan layanan atau pelanggaran constraint jadi hasil terstruktur. */
export async function runService<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<ServiceResult<T>> {
  try {
    return { ok: true, data: await db.transaction(fn) };
  } catch (error) {
    if (error instanceof ServiceFailure) return error.error;
    // 23503 = rujukan (jenis/fakultas/prodi/peneliti/kategori) tidak ada.
    if (pgError(error).code === "23503") {
      return { ok: false, code: "VALIDATION_ERROR", message: "Data rujukan yang dipilih tidak valid." };
    }
    throw error;
  }
}
