import { type SQL, sql } from "drizzle-orm";
import type { Database } from "@/platform/db/client";
import type {
  CatalogDetail,
  CatalogItem,
  CatalogProvider,
  CatalogQuery,
  HomeData,
} from "./types";

/** Syarat tampil publik (docs/WORKFLOW.md §4): hanya published dan belum dihapus. */
const VISIBLE = sql`i.status = 'published' and i.deleted_at is null`;

type ItemRow = {
  slug: string;
  title: string;
  summary: string;
  year: number | null;
  category_name: string | null;
  lead_name: string | null;
  faculty_name: string | null;
  has_ip: boolean;
};

function toItem(r: ItemRow): CatalogItem {
  return {
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    categoryName: r.category_name,
    leadResearcherName: r.lead_name,
    facultyName: r.faculty_name,
    year: r.year,
    hasIp: r.has_ip,
    // Berkas sampul menunggu modul penyimpanan (StorageAdapter).
    coverUrl: null,
    coverAlt: null,
  };
}

/**
 * Timestamp dikeluarkan PostgreSQL sebagai ISO 8601 UTC. Driver mengembalikan kolom timestamp pada
 * query mentah sebagai string berformat PostgreSQL, jadi tidak diparse di JavaScript.
 */
export function isoUtc(column: SQL): SQL {
  return sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

/** Escape karakter khusus LIKE agar "%" atau "_" dari pengguna diperlakukan sebagai teks biasa. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Kolom kartu katalog. Alias `i` = innovations, `f` = faculties. */
const ITEM_SELECT = sql`
  select i.slug, i.title, i.summary, i.year,
    (select c.name from innovation_categories ic join categories c on c.id = ic.category_id
       where ic.innovation_id = i.id order by c.sort_order, c.name limit 1) as category_name,
    (select r.full_name from innovation_members m join researchers r on r.id = m.researcher_id
       where m.innovation_id = i.id and m.role = 'lead') as lead_name,
    f.name as faculty_name,
    exists (select 1 from intellectual_properties p where p.innovation_id = i.id) as has_ip
  from innovations i left join faculties f on f.id = i.faculty_id`;

/** Dipakai bersama provider peneliti. `extraWhere` harus fragmen yang aman (parameter, bukan teks mentah). */
export async function fetchCatalogItems(
  db: Database,
  options: { extraWhere?: SQL; order: SQL; limit: number; offset?: number },
): Promise<CatalogItem[]> {
  const where = options.extraWhere ? sql`${VISIBLE} and ${options.extraWhere}` : VISIBLE;
  const { rows } = await db.execute<ItemRow>(
    sql`${ITEM_SELECT} where ${where} order by ${options.order} limit ${options.limit} offset ${options.offset ?? 0}`,
  );
  return rows.map(toItem);
}

function searchCondition(q: string): SQL {
  const like = `%${escapeLike(q)}%`;
  return sql`(i.search_vector @@ websearch_to_tsquery('simple', ${q}) or i.title ilike ${like})`;
}

export function createPgCatalogProvider(db: Database): CatalogProvider {
  return {
    async search({ q, page, perPage }: CatalogQuery) {
      const extraWhere = q ? searchCondition(q) : undefined;
      const where = extraWhere ? sql`${VISIBLE} and ${extraWhere}` : VISIBLE;
      const order = q
        ? sql`ts_rank(i.search_vector, websearch_to_tsquery('simple', ${q})) desc, i.published_at desc, i.id`
        : sql`i.published_at desc, i.id`;

      const [items, count] = await Promise.all([
        fetchCatalogItems(db, { extraWhere, order, limit: perPage, offset: (page - 1) * perPage }),
        db.execute<{ total: string }>(sql`select count(*) as total from innovations i where ${where}`),
      ]);
      return { items, total: Number(count.rows[0]?.total ?? 0) };
    },

    async home(): Promise<HomeData> {
      const [featured, latest, stats] = await Promise.all([
        fetchCatalogItems(db, {
          extraWhere: sql`i.is_featured`,
          order: sql`i.featured_at desc nulls last, i.published_at desc, i.id`,
          limit: 3,
        }),
        fetchCatalogItems(db, {
          extraWhere: sql`not i.is_featured`,
          order: sql`i.published_at desc, i.id`,
          limit: 6,
        }),
        db.execute<{ innovations: string; researchers: string; faculties: string }>(sql`
          select count(*) as innovations,
            (select count(distinct m.researcher_id) from innovation_members m
               join innovations i2 on i2.id = m.innovation_id
               where i2.status = 'published' and i2.deleted_at is null) as researchers,
            count(distinct i.faculty_id) as faculties
          from innovations i where ${VISIBLE}`),
      ]);
      const s = stats.rows[0];
      const innovations = Number(s?.innovations ?? 0);
      return {
        featured,
        latest,
        // Statistik nol disembunyikan supaya keadaan awal tidak menampilkan angka kosong.
        stats:
          innovations > 0
            ? { innovations, researchers: Number(s?.researchers ?? 0), faculties: Number(s?.faculties ?? 0) }
            : null,
      };
    },

    async getBySlug(slug: string): Promise<CatalogDetail | null> {
      const { rows } = await db.execute<
        ItemRow & {
          id: string;
          type_name: string | null;
          study_program_name: string | null;
          abstract: string | null;
          background: string | null;
          problem_statement: string | null;
          objective: string | null;
          methodology: string | null;
          description: string | null;
          advantages: string | null;
          benefits: string | null;
          development_potential: string | null;
          published_at: string | null;
        }
      >(sql`
        select i.id, i.slug, i.title, i.summary, i.year,
          (select c.name from innovation_categories ic join categories c on c.id = ic.category_id
             where ic.innovation_id = i.id order by c.sort_order, c.name limit 1) as category_name,
          (select r.full_name from innovation_members m join researchers r on r.id = m.researcher_id
             where m.innovation_id = i.id and m.role = 'lead') as lead_name,
          f.name as faculty_name,
          exists (select 1 from intellectual_properties p where p.innovation_id = i.id) as has_ip,
          t.name as type_name, sp.name as study_program_name,
          i.abstract, i.background, i.problem_statement, i.objective, i.methodology,
          i.description, i.advantages, i.benefits, i.development_potential,
          ${isoUtc(sql`i.published_at`)} as published_at
        from innovations i
          left join faculties f on f.id = i.faculty_id
          left join innovation_types t on t.id = i.type_id
          left join study_programs sp on sp.id = i.study_program_id
        where ${VISIBLE} and i.slug = ${slug}`);
      const r = rows[0];
      if (!r) return null;

      const [members, publications, ips] = await Promise.all([
        db.execute<{ full_name: string; role: "lead" | "member" }>(sql`
          select r.full_name, m.role from innovation_members m
            join researchers r on r.id = m.researcher_id
          where m.innovation_id = ${r.id}
          order by (m.role = 'lead') desc, m.sort_order, r.full_name`),
        db.execute<{ title: string; url: string | null; doi: string | null; venue: string | null; year: number | null }>(
          sql`select title, url, doi, venue, year from publications
              where innovation_id = ${r.id} order by sort_order, created_at`,
        ),
        db.execute<{ kind: string; status: string | null; registration_number: string | null; year: number | null }>(
          sql`select kind, status, registration_number, year from intellectual_properties
              where innovation_id = ${r.id} order by created_at`,
        ),
      ]);

      return {
        ...toItem(r),
        typeName: r.type_name,
        studyProgramName: r.study_program_name,
        abstract: r.abstract,
        background: r.background,
        problemStatement: r.problem_statement,
        objective: r.objective,
        methodology: r.methodology,
        description: r.description,
        advantages: r.advantages,
        benefits: r.benefits,
        developmentPotential: r.development_potential,
        members: members.rows.map((m) => ({ name: m.full_name, role: m.role })),
        publications: publications.rows,
        intellectualProperties: ips.rows.map((p) => ({
          kind: p.kind,
          status: p.status,
          registrationNumber: p.registration_number,
          year: p.year,
        })),
        publishedAt: r.published_at,
      };
    },

    async listSlugs() {
      const { rows } = await db.execute<{ slug: string; updated_at: string }>(
        sql`select i.slug, ${isoUtc(sql`i.updated_at`)} as updated_at from innovations i
            where ${VISIBLE} order by i.published_at desc, i.id`,
      );
      return rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
    },
  };
}
