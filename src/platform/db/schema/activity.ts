import { sql } from "drizzle-orm";
import {
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { collabStatus, innovationStatus } from "./enums";
import { createdAt, pk, timestamps } from "./helpers";
import { users } from "./identity";
import { innovations } from "./innovations";

/** Append-only: aplikasi hanya melakukan INSERT. */
export const statusHistories = pgTable(
  "status_histories",
  {
    id: pk(),
    innovationId: uuid("innovation_id")
      .notNull()
      .references(() => innovations.id, { onDelete: "cascade" }),
    fromStatus: innovationStatus("from_status"),
    toStatus: innovationStatus("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("status_histories_innovation_idx").on(t.innovationId, t.createdAt)],
);

/** Mengandung data pribadi pihak luar: masa simpan perlu ditetapkan (SECURITY.md §9). */
export const collaborationRequests = pgTable(
  "collaboration_requests",
  {
    id: pk(),
    innovationId: uuid("innovation_id").references(() => innovations.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    organization: text("organization").notNull(),
    phone: text("phone"),
    message: text("message").notNull(),
    status: collabStatus("status").notNull().default("new"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    handlerNote: text("handler_note"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    /** Hash IP, bukan IP mentah. */
    ipHash: text("ip_hash"),
    ...timestamps(),
  },
  (t) => [index("collaboration_requests_status_idx").on(t.status, t.createdAt)],
);

/** Append-only. Tanpa data sensitif di kolom changes. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    changes: jsonb("changes"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
  ],
);

export const websiteSettings = pgTable("website_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default(sql`'{}'::jsonb`),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
