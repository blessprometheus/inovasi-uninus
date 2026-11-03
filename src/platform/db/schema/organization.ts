import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./helpers";
import { users } from "./identity";

export const faculties = pgTable("faculties", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const studyPrograms = pgTable(
  "study_programs",
  {
    id: pk(),
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculties.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("study_programs_faculty_id_idx").on(t.facultyId)],
);

/**
 * Profil peneliti. user_id boleh kosong: anggota tim bisa bukan pengguna SSO.
 * Field mana yang diisi dari SSO menunggu OQ-02 (docs/DECISIONS.md).
 */
export const researchers = pgTable(
  "researchers",
  {
    id: pk(),
    userId: uuid("user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    slug: text("slug").notNull().unique(),
    fullName: text("full_name").notNull(),
    /** NIDN/NIP. Tidak ditampilkan di rute publik. */
    identifier: text("identifier"),
    facultyId: uuid("faculty_id").references(() => faculties.id, { onDelete: "set null" }),
    studyProgramId: uuid("study_program_id").references(() => studyPrograms.id, {
      onDelete: "set null",
    }),
    position: text("position"),
    bio: text("bio"),
    photoFileKey: text("photo_file_key"),
    externalLinks: jsonb("external_links").$type<Record<string, string>>(),
    isPublic: boolean("is_public").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("researchers_faculty_id_idx").on(t.facultyId),
    index("researchers_study_program_id_idx").on(t.studyProgramId),
  ],
);

export const innovationTypes = pgTable("innovation_types", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const categories = pgTable("categories", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});
