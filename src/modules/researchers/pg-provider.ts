import { sql } from "drizzle-orm";
import { escapeLike, fetchCatalogItems, isoUtc } from "@/modules/catalog/pg-provider";
import type { Database } from "@/platform/db/client";
import type { ResearcherDetail, ResearcherItem, ResearcherProvider } from "./types";

/** Profil tampil publik bila ditandai publik dan belum dihapus. */
const PUBLIC = sql`r.is_public and r.deleted_at is null`;

type ResearcherRow = {
  slug: string;
  full_name: string;
  position: string | null;
  faculty_name: string | null;
  study_program_name: string | null;
  innovation_count: string;
};

/** NIDN/NIP (`identifier`) sengaja tidak pernah dipilih. */
const RESEARCHER_SELECT = sql`
  select r.slug, r.full_name, r.position, f.name as faculty_name, sp.name as study_program_name,
    (select count(*) from innovation_members m join innovations i on i.id = m.innovation_id
       where m.researcher_id = r.id and i.status = 'published' and i.deleted_at is null) as innovation_count
  from researchers r
    left join faculties f on f.id = r.faculty_id
    left join study_programs sp on sp.id = r.study_program_id`;

function toItem(r: ResearcherRow): ResearcherItem {
  return {
    slug: r.slug,
    fullName: r.full_name,
    position: r.position,
    facultyName: r.faculty_name,
    studyProgramName: r.study_program_name,
    innovationCount: Number(r.innovation_count),
  };
}

/** Hanya tautan http/https yang lolos; nilai lain (mis. javascript:) dibuang. */
export function safeExternalLinks(raw: unknown): { label: string; url: string }[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const links: { label: string; url: string }[] = [];
  for (const [label, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    try {
      const u = new URL(value);
      if (u.protocol === "http:" || u.protocol === "https:") links.push({ label, url: u.href });
    } catch {
      // URL tidak valid: dibuang.
    }
  }
  return links;
}

export function createPgResearcherProvider(db: Database): ResearcherProvider {
  return {
    async search({ q, page, perPage }) {
      const where = q ? sql`${PUBLIC} and r.full_name ilike ${`%${escapeLike(q)}%`}` : PUBLIC;
      const [rows, count] = await Promise.all([
        db.execute<ResearcherRow>(
          sql`${RESEARCHER_SELECT} where ${where}
              order by r.full_name, r.id limit ${perPage} offset ${(page - 1) * perPage}`,
        ),
        db.execute<{ total: string }>(sql`select count(*) as total from researchers r where ${where}`),
      ]);
      return { items: rows.rows.map(toItem), total: Number(count.rows[0]?.total ?? 0) };
    },

    async getBySlug(slug): Promise<ResearcherDetail | null> {
      const { rows } = await db.execute<ResearcherRow & { id: string; bio: string | null; external_links: unknown }>(
        sql`select r.id, r.bio, r.external_links, x.slug, x.full_name, x.position, x.faculty_name,
              x.study_program_name, x.innovation_count
            from researchers r
            join (${RESEARCHER_SELECT}) x on x.slug = r.slug
            where ${PUBLIC} and r.slug = ${slug}`,
      );
      const row = rows[0];
      if (!row) return null;

      const innovations = await fetchCatalogItems(db, {
        extraWhere: sql`i.id in (select m.innovation_id from innovation_members m where m.researcher_id = ${row.id})`,
        order: sql`i.published_at desc, i.id`,
        limit: 50,
      });
      return {
        ...toItem(row),
        bio: row.bio,
        externalLinks: safeExternalLinks(row.external_links),
        innovations,
      };
    },

    async listSlugs() {
      const { rows } = await db.execute<{ slug: string; updated_at: string }>(
        sql`select r.slug, ${isoUtc(sql`r.updated_at`)} as updated_at from researchers r
            where ${PUBLIC} order by r.full_name, r.id`,
      );
      return rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
    },
  };
}
