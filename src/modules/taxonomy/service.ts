import { and, eq, sql } from "drizzle-orm";
import { can, type AuthUser } from "@/modules/auth/authorize";
import { uniqueSlug } from "@/modules/innovations/slug";
import { failure, NOT_FOUND, runService, type ServiceResult, type Tx } from "@/modules/innovations/service-core";
import type { Database } from "@/platform/db/client";
import { categories, faculties, innovationTypes, studyPrograms } from "@/platform/db/schema";
import { recordAudit } from "@/platform/audit/audit";
import { z } from "@/platform/http/zod";

export const TAXONOMY_KINDS = ["faculties", "study-programs", "categories", "innovation-types"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export interface TaxonomyItem {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  /** Hanya program studi. */
  facultyId?: string;
  /** Hanya kategori. */
  description?: string | null;
  /** Hanya kategori dan jenis inovasi. */
  sortOrder?: number;
  /** Jumlah inovasi terbit yang memakai item ini. */
  innovationCount: number;
}

const name = z.string().trim().min(2, "Nama minimal 2 karakter.").max(150, "Nama maksimal 150 karakter.");
const sortOrder = z.number().int().min(0).max(10_000);

const SCHEMAS = {
  faculties: {
    create: z.strictObject({ name, isActive: z.boolean().optional() }),
    patch: z.strictObject({ name: name.optional(), isActive: z.boolean().optional() }),
  },
  "study-programs": {
    create: z.strictObject({ facultyId: z.uuid("Fakultas tidak valid."), name, isActive: z.boolean().optional() }),
    patch: z.strictObject({ name: name.optional(), isActive: z.boolean().optional() }),
  },
  categories: {
    create: z.strictObject({
      name,
      description: z.string().trim().max(500).nullable().optional(),
      sortOrder: sortOrder.optional(),
      isActive: z.boolean().optional(),
    }),
    patch: z.strictObject({
      name: name.optional(),
      description: z.string().trim().max(500).nullable().optional(),
      sortOrder: sortOrder.optional(),
      isActive: z.boolean().optional(),
    }),
  },
  "innovation-types": {
    create: z.strictObject({ name, sortOrder: sortOrder.optional(), isActive: z.boolean().optional() }),
    patch: z.strictObject({ name: name.optional(), sortOrder: sortOrder.optional(), isActive: z.boolean().optional() }),
  },
} as const;

/** Ekspresi hitung inovasi terbit per jenis. Nama tabel/kolom tetap (konstanta), bukan input pengguna. */
const COUNT_SQL: Record<TaxonomyKind, string> = {
  faculties: `select count(*) from innovations i where i.faculty_id = t.id and i.status = 'published' and i.deleted_at is null`,
  "study-programs": `select count(*) from innovations i where i.study_program_id = t.id and i.status = 'published' and i.deleted_at is null`,
  "innovation-types": `select count(*) from innovations i where i.type_id = t.id and i.status = 'published' and i.deleted_at is null`,
  categories: `select count(*) from innovation_categories ic join innovations i on i.id = ic.innovation_id where ic.category_id = t.id and i.status = 'published' and i.deleted_at is null`,
};

const TABLE_SQL: Record<TaxonomyKind, string> = {
  faculties: "faculties",
  "study-programs": "study_programs",
  categories: "categories",
  "innovation-types": "innovation_types",
};

const EXTRA_COLUMNS: Record<TaxonomyKind, string> = {
  faculties: "",
  "study-programs": ", t.faculty_id",
  categories: ", t.description, t.sort_order",
  "innovation-types": ", t.sort_order",
};

const ORDER_SQL: Record<TaxonomyKind, string> = {
  faculties: "t.name",
  "study-programs": "t.name",
  categories: "t.sort_order, t.name",
  "innovation-types": "t.sort_order, t.name",
};

type Row = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  faculty_id?: string;
  description?: string | null;
  sort_order?: number;
  innovation_count: string;
};

function toItem(kind: TaxonomyKind, r: Row): TaxonomyItem {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    isActive: r.is_active,
    ...(kind === "study-programs" ? { facultyId: r.faculty_id } : {}),
    ...(kind === "categories" ? { description: r.description ?? null } : {}),
    ...(kind === "categories" || kind === "innovation-types" ? { sortOrder: r.sort_order ?? 0 } : {}),
    innovationCount: Number(r.innovation_count),
  };
}

/**
 * Semua tabel taksonomi berbagi kolom id/slug/name/is_active. Pembaruan generik memakai tipe tabel
 * kategori sebagai bentuk umum; kolom khusus per jenis dikendalikan oleh schema Zod di atas.
 */
const TABLES = {
  faculties,
  "study-programs": studyPrograms,
  categories,
  "innovation-types": innovationTypes,
} as const;

export function createTaxonomyService(db: Database) {
  const run = <T,>(fn: (tx: Tx) => Promise<T>): Promise<ServiceResult<T>> => runService(db, fn);

  function requireManage(actor: AuthUser) {
    if (!can(actor, "taxonomy.manage")) failure("FORBIDDEN", "Anda tidak berwenang mengelola data acuan.");
  }

  async function listItems(kind: TaxonomyKind, onlyActive: boolean): Promise<TaxonomyItem[]> {
    const { rows } = await db.execute<Row>(
      sql.raw(
        `select t.id, t.slug, t.name, t.is_active${EXTRA_COLUMNS[kind]}, (${COUNT_SQL[kind]}) as innovation_count
         from ${TABLE_SQL[kind]} t ${onlyActive ? "where t.is_active" : ""} order by ${ORDER_SQL[kind]}`,
      ),
    );
    return rows.map((r) => toItem(kind, r));
  }

  async function getItem(kind: TaxonomyKind, id: string): Promise<TaxonomyItem> {
    const items = await listItems(kind, false);
    const item = items.find((i) => i.id === id);
    if (!item) NOT_FOUND();
    return item!;
  }

  return {
    /** Publik: hanya item aktif, dipakai filter katalog dan form. */
    listPublic: (kind: TaxonomyKind) => listItems(kind, true),

    async list(actor: AuthUser, kind: TaxonomyKind): Promise<ServiceResult<TaxonomyItem[]>> {
      return run(async () => {
        requireManage(actor);
        return listItems(kind, false);
      });
    },

    async create(actor: AuthUser, kind: TaxonomyKind, raw: unknown): Promise<ServiceResult<TaxonomyItem>> {
      const created = await run(async (tx) => {
        requireManage(actor);
        const parsed = SCHEMAS[kind].create.safeParse(raw);
        if (!parsed.success) {
          return failure(
            "VALIDATION_ERROR",
            "Data yang dikirim tidak valid.",
            parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message })),
          );
        }
        const input = parsed.data as Record<string, unknown> & { name: string };
        const table = TABLES[kind] as typeof categories;
        const slug = await uniqueSlug(input.name, async (candidate) => {
          const [hit] = await tx.select({ id: table.id }).from(table).where(eq(table.slug, candidate));
          return Boolean(hit);
        });
        const values = { ...input, slug } as typeof categories.$inferInsert;
        const [row] = await tx.insert(table).values(values).returning({ id: table.id });
        await recordAudit(tx, {
          actorId: actor.id,
          action: "taxonomy.create",
          entityType: kind,
          entityId: row.id,
          changes: { name: input.name },
        });
        return row.id;
      });
      return created.ok ? run(async () => getItem(kind, created.data)) : created;
    },

    async update(actor: AuthUser, kind: TaxonomyKind, id: string, raw: unknown): Promise<ServiceResult<TaxonomyItem>> {
      const updated = await run(async (tx) => {
        requireManage(actor);
        if (!z.uuid().safeParse(id).success) NOT_FOUND();
        const parsed = SCHEMAS[kind].patch.safeParse(raw);
        if (!parsed.success) {
          return failure(
            "VALIDATION_ERROR",
            "Data yang dikirim tidak valid.",
            parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message })),
          );
        }
        const table = TABLES[kind] as typeof categories;
        // Slug tidak pernah berubah (URL filter dan referensi tetap stabil).
        const [row] = await tx
          .update(table)
          .set(parsed.data as Partial<typeof categories.$inferInsert>)
          .where(and(eq(table.id, id)))
          .returning({ id: table.id });
        if (!row) NOT_FOUND();
        await recordAudit(tx, {
          actorId: actor.id,
          action: "taxonomy.update",
          entityType: kind,
          entityId: id,
          changes: { fields: Object.keys(parsed.data) },
        });
        return id;
      });
      return updated.ok ? run(async () => getItem(kind, updated.data)) : updated;
    },
  };
}

export type TaxonomyService = ReturnType<typeof createTaxonomyService>;
