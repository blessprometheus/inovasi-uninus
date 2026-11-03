import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fileKind, fileVisibility, innovationStatus, ipKind, memberRole } from "./enums";
import { pk, timestamps, tsvector } from "./helpers";
import { users } from "./identity";
import {
  categories,
  faculties,
  innovationTypes,
  researchers,
  studyPrograms,
} from "./organization";

export const innovations = pgTable(
  "innovations",
  {
    id: pk(),
    /** Dikunci setelah pertama kali dipublikasikan (first_published_at), demi SEO. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    abstract: text("abstract"),
    background: text("background"),
    problemStatement: text("problem_statement"),
    objective: text("objective"),
    methodology: text("methodology"),
    description: text("description"),
    advantages: text("advantages"),
    benefits: text("benefits"),
    developmentPotential: text("development_potential"),
    year: smallint("year"),
    typeId: uuid("type_id").references(() => innovationTypes.id, { onDelete: "set null" }),
    facultyId: uuid("faculty_id").references(() => faculties.id, { onDelete: "set null" }),
    studyProgramId: uuid("study_program_id").references(() => studyPrograms.id, {
      onDelete: "set null",
    }),
    status: innovationStatus("status").notNull().default("draft"),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    firstPublishedAt: timestamp("first_published_at", { withTimezone: true }),
    isFeatured: boolean("is_featured").notNull().default(false),
    featuredAt: timestamp("featured_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    /**
     * Pencarian teks. Konfigurasi 'simple' dipakai dulu; konfigurasi 'indonesian'
     * dievaluasi setelah versi PostgreSQL server diverifikasi (SYSTEM_ARCHITECTURE.md §6).
     */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(summary, '')), 'B') || setweight(to_tsvector('simple', coalesce(abstract, '') || ' ' || coalesce(description, '') || ' ' || coalesce(problem_statement, '') || ' ' || coalesce(benefits, '')), 'C')`,
    ),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => {
    const visible = sql`${t.status} = 'published' and ${t.deletedAt} is null`;
    return [
      uniqueIndex("innovations_slug_uq").on(t.slug),
      check("innovations_year_ck", sql`${t.year} is null or (${t.year} between 1900 and 2100)`),
      index("innovations_published_at_idx").on(t.publishedAt.desc()).where(visible),
      index("innovations_faculty_pub_idx").on(t.facultyId).where(visible),
      index("innovations_study_program_pub_idx").on(t.studyProgramId).where(visible),
      index("innovations_type_pub_idx").on(t.typeId).where(visible),
      index("innovations_year_pub_idx").on(t.year).where(visible),
      index("innovations_search_idx").using("gin", t.searchVector),
      index("innovations_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
      index("innovations_owner_status_idx").on(t.submittedBy, t.status),
    ];
  },
);

export const innovationMembers = pgTable(
  "innovation_members",
  {
    innovationId: uuid("innovation_id")
      .notNull()
      .references(() => innovations.id, { onDelete: "cascade" }),
    researcherId: uuid("researcher_id")
      .notNull()
      .references(() => researchers.id, { onDelete: "restrict" }),
    role: memberRole("role").notNull().default("member"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.innovationId, t.researcherId] }),
    uniqueIndex("innovation_members_one_lead_uq")
      .on(t.innovationId)
      .where(sql`${t.role} = 'lead'`),
    index("innovation_members_researcher_idx").on(t.researcherId),
  ],
);

export const innovationCategories = pgTable(
  "innovation_categories",
  {
    innovationId: uuid("innovation_id")
      .notNull()
      .references(() => innovations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.innovationId, t.categoryId] }),
    index("innovation_categories_category_idx").on(t.categoryId, t.innovationId),
  ],
);

export const publications = pgTable(
  "publications",
  {
    id: pk(),
    innovationId: uuid("innovation_id")
      .notNull()
      .references(() => innovations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Hanya http/https, divalidasi di lapisan aplikasi dan di database. */
    url: text("url"),
    doi: text("doi"),
    venue: text("venue"),
    year: smallint("year"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("publications_innovation_idx").on(t.innovationId),
    check("publications_url_scheme_ck", sql`${t.url} is null or ${t.url} ~* '^https?://'`),
  ],
);

export const intellectualProperties = pgTable(
  "intellectual_properties",
  {
    id: pk(),
    innovationId: uuid("innovation_id")
      .notNull()
      .references(() => innovations.id, { onDelete: "cascade" }),
    kind: ipKind("kind").notNull(),
    /** Daftar nilai status ditentukan bersama pengguna (OQ-12), jadi teks bebas dulu. */
    status: text("status"),
    registrationNumber: text("registration_number"),
    year: smallint("year"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [index("intellectual_properties_innovation_idx").on(t.innovationId)],
);

export const innovationFiles = pgTable(
  "innovation_files",
  {
    id: pk(),
    innovationId: uuid("innovation_id")
      .notNull()
      .references(() => innovations.id, { onDelete: "cascade" }),
    kind: fileKind("kind").notNull(),
    /** Default 'restricted': tidak publik sampai ditetapkan (OQ-09). */
    visibility: fileVisibility("visibility").notNull().default("restricted"),
    title: text("title"),
    altText: text("alt_text"),
    storageKey: text("storage_key"),
    url: text("url"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    sha256: text("sha256"),
    isCover: boolean("is_cover").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("innovation_files_innovation_idx").on(t.innovationId),
    uniqueIndex("innovation_files_one_cover_uq")
      .on(t.innovationId)
      .where(sql`${t.isCover} = true`),
    check("innovation_files_size_ck", sql`${t.sizeBytes} is null or ${t.sizeBytes} > 0`),
    check(
      "innovation_files_source_ck",
      sql`(${t.kind} = 'video_link' and ${t.url} is not null and ${t.url} ~* '^https?://') or (${t.kind} <> 'video_link' and ${t.storageKey} is not null)`,
    ),
  ],
);
