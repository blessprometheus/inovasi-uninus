import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  inet,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, pk, timestamps } from "./helpers";

export const users = pgTable(
  "users",
  {
    id: pk(),
    /** Kosong untuk akun lokal (ADR-008: tanpa SSO). Hanya login pengembangan yang mengisinya ("dev:..."). */
    ssoSubject: text("sso_subject"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** Hash argon2id. Kosong = akun tidak bisa login dengan kata sandi. */
    passwordHash: text("password_hash"),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    /** Akun baru atau yang kata sandinya diatur ulang super admin wajib menggantinya sebelum bekerja. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("users_sso_subject_uq").on(t.ssoSubject),
    uniqueIndex("users_email_uq").on(t.email),
    check("users_email_lowercase_ck", sql`${t.email} = lower(${t.email})`),
  ],
);

export const roles = pgTable("roles", {
  id: pk(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  ...timestamps(),
});

export const permissions = pgTable("permissions", {
  id: pk(),
  code: text("code").notNull().unique(),
  description: text("description").notNull(),
  ...timestamps(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

/** Sesi opaque. Hanya hash token yang disimpan, token mentah hanya ada di cookie. */
export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);
