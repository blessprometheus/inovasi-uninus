import { and, eq, ilike, inArray, isNull } from "drizzle-orm";
import { escapeLike } from "@/modules/catalog/pg-provider";
import type { AuthHandlers } from "@/platform/auth/handlers";
import type { Database } from "@/platform/db/client";
import { faculties, researchers } from "@/platform/db/schema";
import { fail, json, ok } from "@/platform/http/response";

export interface ResearcherOption {
  id: string;
  fullName: string;
  facultyName: string | null;
}

const MIN_QUERY = 2;
const MAX_RESULTS = 10;

/**
 * Pemilih anggota tim di formulir. Hanya profil publik yang bisa dicari (usulan untuk OQ-21), dan
 * hanya id, nama, fakultas yang keluar: NIDN/NIP tidak pernah dipilih.
 */
export function createResearcherLookup(db: Database) {
  return {
    async search(q: string): Promise<ResearcherOption[]> {
      const term = q.trim().slice(0, 100);
      if (term.length < MIN_QUERY) return [];
      const rows = await db
        .select({ id: researchers.id, fullName: researchers.fullName, facultyName: faculties.name })
        .from(researchers)
        .leftJoin(faculties, eq(faculties.id, researchers.facultyId))
        .where(
          and(
            eq(researchers.isPublic, true),
            isNull(researchers.deletedAt),
            ilike(researchers.fullName, `%${escapeLike(term)}%`),
          ),
        )
        .orderBy(researchers.fullName, researchers.id)
        .limit(MAX_RESULTS);
      return rows;
    },

    /** Profil peneliti milik pengguna (ketua default di formulir), atau null bila belum ada. */
    async byUserId(userId: string): Promise<ResearcherOption | null> {
      const [row] = await db
        .select({ id: researchers.id, fullName: researchers.fullName, facultyName: faculties.name })
        .from(researchers)
        .leftJoin(faculties, eq(faculties.id, researchers.facultyId))
        .where(and(eq(researchers.userId, userId), isNull(researchers.deletedAt)));
      return row ?? null;
    },

    /** Nama untuk id yang sudah tersimpan di sebuah inovasi (termasuk profil non-publik anggota tim). */
    async byIds(ids: string[]): Promise<ResearcherOption[]> {
      if (!ids.length) return [];
      return db
        .select({ id: researchers.id, fullName: researchers.fullName, facultyName: faculties.name })
        .from(researchers)
        .leftJoin(faculties, eq(faculties.id, researchers.facultyId))
        .where(and(inArray(researchers.id, ids), isNull(researchers.deletedAt)));
    },
  };
}

export type ResearcherLookup = ReturnType<typeof createResearcherLookup>;

/** `GET /api/v1/me/researchers?q=` untuk pengguna yang boleh membuat inovasi. */
export function createResearcherLookupHandler(deps: { auth: AuthHandlers; lookup: ResearcherLookup }) {
  return async function handle(request: Request): Promise<Response> {
    const gate = await deps.auth.authenticate(request, { permission: "innovation.create" });
    if ("response" in gate) return gate.response;
    const q = new URL(request.url).searchParams.get("q") ?? "";
    if (q.length > 100) return json(fail("VALIDATION_ERROR", "Kata kunci terlalu panjang."));
    return json(ok(await deps.lookup.search(q)));
  };
}
