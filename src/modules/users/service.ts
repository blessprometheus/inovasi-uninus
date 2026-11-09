import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { can, type AuthUser } from "@/modules/auth/authorize";
import {
  failure,
  NOT_FOUND,
  runService,
  type ServiceResult,
  type Tx,
} from "@/modules/innovations/service-core";
import { recordAudit } from "@/platform/audit/audit";
import { generateTemporaryPassword, hashPassword } from "@/platform/auth/password";
import { normalizeEmail } from "@/platform/auth/local-auth";
import type { Database } from "@/platform/db/client";
import { roles, sessions, userRoles, users } from "@/platform/db/schema";
import { z } from "@/platform/http/zod";

/**
 * Pengelolaan akun oleh super admin (ADR-008). Tanpa SSO dan tanpa email, jadi akun baru dan atur
 * ulang sandi memakai kata sandi sementara yang ditampilkan SEKALI ke super admin dan wajib diganti
 * pemiliknya saat masuk pertama. Kata sandi tidak pernah disimpan atau dicatat polos.
 */

/** Peran yang boleh dipegang akun lokal. `researcher` hanya untuk portal dosen yang tertidur. */
export const MANAGED_ROLES = ["operator", "super_admin"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  roles: string[];
  isActive: boolean;
  /** Akun tanpa kata sandi (mis. akun pengembangan) tidak bisa masuk lewat formulir. */
  hasPassword: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const createSchema = z.strictObject({
  email: z.string().trim().max(254).pipe(z.email("Email tidak valid.")),
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120, "Nama maksimal 120 karakter."),
  role: z.enum(MANAGED_ROLES, "Peran tidak dikenal."),
});

const patchSchema = z
  .strictObject({
    isActive: z.boolean().optional(),
    role: z.enum(MANAGED_ROLES, "Peran tidak dikenal.").optional(),
  })
  .refine((v) => v.isActive !== undefined || v.role !== undefined, "Tidak ada yang diubah.");

const uuid = z.uuid();
const issues = (error: z.ZodError) =>
  error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message }));

export function createUsersService(db: Database) {
  const run = <T,>(fn: (tx: Tx) => Promise<T>): Promise<ServiceResult<T>> => runService(db, fn);

  /** 404 bagi yang tidak berhak, supaya keberadaan data tidak bocor (konsisten dengan layanan admin lain). */
  function requireManage(actor: AuthUser) {
    if (!can(actor, "user.manage")) NOT_FOUND();
  }

  async function rolesOf(tx: Tx, userIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!userIds.length) return map;
    const rows = await tx
      .select({ userId: userRoles.userId, code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds));
    for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.code].sort());
    return map;
  }

  async function loadTarget(tx: Tx, id: string) {
    if (!uuid.safeParse(id).success) NOT_FOUND();
    const [row] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .for("update");
    if (!row) NOT_FOUND();
    return row!;
  }

  /** Super admin aktif selain `exceptId`. Mencegah sistem tanpa satu pun super admin. */
  async function otherActiveSuperAdmins(tx: Tx, exceptId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(roles.code, "super_admin"), eq(users.isActive, true), isNull(users.deletedAt), ne(users.id, exceptId)));
    return row.n;
  }

  const toListItem = (row: typeof users.$inferSelect, roleCodes: string[]): UserListItem => ({
    id: row.id,
    email: row.email,
    name: row.name,
    roles: roleCodes,
    isActive: row.isActive,
    hasPassword: row.passwordHash !== null,
    mustChangePassword: row.mustChangePassword,
    lockedUntil: row.lockedUntil?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });

  async function toItem(tx: Tx, row: typeof users.$inferSelect): Promise<UserListItem> {
    return toListItem(row, (await rolesOf(tx, [row.id])).get(row.id) ?? []);
  }

  async function setRoleRow(tx: Tx, userId: string, role: ManagedRole) {
    const [target] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, role));
    if (!target) failure("INTERNAL_ERROR", "Peran belum ada di database. Jalankan `npm run db:seed` dulu.");
    const managed = await tx.select({ id: roles.id }).from(roles).where(inArray(roles.code, [...MANAGED_ROLES]));
    await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, managed.map((m) => m.id))));
    await tx.insert(userRoles).values({ userId, roleId: target!.id });
  }

  return {
    async list(actor: AuthUser): Promise<ServiceResult<UserListItem[]>> {
      return run(async (tx) => {
        requireManage(actor);
        const rows = await tx.select().from(users).where(isNull(users.deletedAt)).orderBy(users.createdAt, users.id);
        const map = await rolesOf(tx, rows.map((r) => r.id));
        return rows.map((row) => toListItem(row, map.get(row.id) ?? []));
      });
    },

    /** Membuat akun lokal. Mengembalikan kata sandi sementara satu kali ini saja. */
    async create(actor: AuthUser, rawInput: unknown): Promise<ServiceResult<{ user: UserListItem; temporaryPassword: string }>> {
      const temporaryPassword = generateTemporaryPassword();
      const hash = await hashPassword(temporaryPassword);
      return run(async (tx) => {
        requireManage(actor);
        if (!can(actor, "role.assign")) failure("FORBIDDEN", "Anda tidak berwenang memberikan peran.");
        const parsed = createSchema.safeParse(rawInput);
        if (!parsed.success) return failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", issues(parsed.error));
        const email = normalizeEmail(parsed.data.email);

        const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (existing) {
          failure("CONFLICT", "Email ini sudah terdaftar.", [{ field: "email", message: "Email ini sudah terdaftar." }]);
        }
        const [row] = await tx
          .insert(users)
          .values({
            email,
            name: parsed.data.name,
            passwordHash: hash,
            passwordChangedAt: new Date(),
            mustChangePassword: true,
          })
          .returning();
        await setRoleRow(tx, row.id, parsed.data.role);
        await recordAudit(tx, {
          actorId: actor.id,
          action: "user.create",
          entityType: "user",
          entityId: row.id,
          changes: { role: parsed.data.role },
        });
        return { user: await toItem(tx, row), temporaryPassword };
      });
    },

    /** Mengaktifkan/menonaktifkan akun dan/atau mengganti perannya. */
    async update(actor: AuthUser, id: string, rawPatch: unknown): Promise<ServiceResult<UserListItem>> {
      return run(async (tx) => {
        requireManage(actor);
        const target = await loadTarget(tx, id);
        const parsed = patchSchema.safeParse(rawPatch);
        if (!parsed.success) return failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", issues(parsed.error));
        const { isActive, role } = parsed.data;

        if (target.id === actor.id) {
          failure("FORBIDDEN", "Anda tidak dapat mengubah akun Anda sendiri. Minta super admin lain.");
        }
        const currentRoles = (await rolesOf(tx, [target.id])).get(target.id) ?? [];
        const isSuper = currentRoles.includes("super_admin");
        const losesSuper = isSuper && ((isActive === false && target.isActive) || (role !== undefined && role !== "super_admin"));
        if (losesSuper && (await otherActiveSuperAdmins(tx, target.id)) === 0) {
          failure("CONFLICT", "Harus tersisa minimal satu super admin aktif.");
        }

        const changes: Record<string, unknown> = {};
        if (isActive !== undefined && isActive !== target.isActive) {
          await tx.update(users).set({ isActive }).where(eq(users.id, target.id));
          changes.isActive = isActive;
        }
        if (role !== undefined && !(currentRoles.length === 1 && currentRoles[0] === role)) {
          if (!can(actor, "role.assign")) failure("FORBIDDEN", "Anda tidak berwenang mengubah peran.");
          await setRoleRow(tx, target.id, role);
          changes.role = role;
        }
        if (Object.keys(changes).length) {
          // Hak akses yang berubah atau akun yang dinonaktifkan berlaku seketika, bukan saat sesi habis.
          await tx.delete(sessions).where(eq(sessions.userId, target.id));
          await recordAudit(tx, { actorId: actor.id, action: "user.update", entityType: "user", entityId: target.id, changes });
        }
        const [fresh] = await tx.select().from(users).where(eq(users.id, target.id));
        return toItem(tx, fresh);
      });
    },

    /** Atur ulang sandi: sandi sementara baru, kunci dibuka, semua sesi dicabut, wajib ganti saat masuk. */
    async resetPassword(actor: AuthUser, id: string): Promise<ServiceResult<{ temporaryPassword: string }>> {
      const temporaryPassword = generateTemporaryPassword();
      const hash = await hashPassword(temporaryPassword);
      return run(async (tx) => {
        requireManage(actor);
        const target = await loadTarget(tx, id);
        if (target.id === actor.id) {
          failure("FORBIDDEN", "Untuk mengganti sandi sendiri, pakai menu Kata sandi.");
        }
        await tx
          .update(users)
          .set({ passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null })
          .where(eq(users.id, target.id));
        await tx.delete(sessions).where(eq(sessions.userId, target.id));
        await recordAudit(tx, { actorId: actor.id, action: "user.password_reset", entityType: "user", entityId: target.id });
        return { temporaryPassword };
      });
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
