import { and, eq, ne, sql } from "drizzle-orm";
import { checkPasswordPolicy } from "@/modules/auth/password-policy";
import { recordAudit } from "@/platform/audit/audit";
import type { Database } from "@/platform/db/client";
import { sessions, users } from "@/platform/db/schema";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password";

/**
 * Login lokal email + kata sandi untuk operator dan super admin (ADR-008).
 *
 * Prinsip: semua kegagalan login terlihat sama bagi pemanggil (`{ ok: false }`), baik email tidak
 * ada, kata sandi salah, akun nonaktif, tanpa kata sandi, maupun terkunci. Alasannya hanya masuk
 * audit log. Waktu respons juga disamakan lewat hash palsu.
 */

export interface LocalAuthOptions {
  /** Jumlah kegagalan beruntun sebelum akun dikunci. */
  maxFailures?: number;
  lockMinutes?: number;
  now?: () => Date;
}

export type LoginResult =
  | { ok: true; user: { id: string; email: string; name: string; mustChangePassword: boolean } }
  | { ok: false };

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; code: "WRONG_CURRENT" | "WEAK_PASSWORD" | "SAME_PASSWORD" | "LOCKED"; message: string };

/** Batas wajar agar input raksasa tidak dipakai membebani CPU sebelum ditolak. */
const MAX_INPUT_LENGTH = 1024;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createLocalAuth(db: Database, options: LocalAuthOptions = {}) {
  const maxFailures = options.maxFailures ?? 5;
  const lockMinutes = options.lockMinutes ?? 15;
  const now = options.now ?? (() => new Date());

  /** Menambah hitungan gagal secara atomik dan mengunci akun bila batas terlewati. */
  async function recordFailure(userId: string, userAgent: string | null, reason: string): Promise<boolean> {
    const [row] = await db
      .update(users)
      .set({
        failedLoginCount: sql`${users.failedLoginCount} + 1`,
        lockedUntil: sql`case when ${users.failedLoginCount} + 1 >= ${maxFailures}
          then now() + (${lockMinutes} * interval '1 minute') else ${users.lockedUntil} end`,
      })
      .where(eq(users.id, userId))
      .returning({ count: users.failedLoginCount });
    const locked = (row?.count ?? 0) >= maxFailures;
    await recordAudit(db, {
      actorId: null,
      action: locked ? "auth.account_locked" : "auth.login_failed",
      entityType: "user",
      entityId: userId,
      changes: { reason },
      userAgent,
    });
    return locked;
  }

  return {
    async login(
      input: { email: string; password: string },
      meta: { userAgent?: string | null } = {},
    ): Promise<LoginResult> {
      const userAgent = meta.userAgent ?? null;
      const email = normalizeEmail(input.email);
      const fail = async (reason: string, userId?: string): Promise<LoginResult> => {
        if (!userId) {
          await recordAudit(db, {
            actorId: null,
            action: "auth.login_failed",
            entityType: "user",
            changes: { reason },
            userAgent,
          });
        }
        return { ok: false };
      };

      if (input.password.length > MAX_INPUT_LENGTH || email.length > 254) {
        await verifyAgainstDummy("x");
        return fail("input_too_long");
      }

      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user || !user.passwordHash) {
        await verifyAgainstDummy(input.password);
        return fail("unknown_or_no_password");
      }
      if (!user.isActive || user.deletedAt) {
        await verifyAgainstDummy(input.password);
        await recordAudit(db, { actorId: null, action: "auth.login_failed", entityType: "user", entityId: user.id, changes: { reason: "inactive" }, userAgent });
        return { ok: false };
      }

      if (user.lockedUntil) {
        if (user.lockedUntil > now()) {
          await verifyAgainstDummy(input.password);
          await recordAudit(db, { actorId: null, action: "auth.login_failed", entityType: "user", entityId: user.id, changes: { reason: "locked" }, userAgent });
          return { ok: false };
        }
        // Masa kunci sudah lewat: mulai dari nol, bukan langsung terkunci lagi pada salah ketik pertama.
        await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
      }

      if (!(await verifyPassword(user.passwordHash, input.password))) {
        await recordFailure(user.id, userAgent, "wrong_password");
        return { ok: false };
      }

      await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
      return {
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, mustChangePassword: user.mustChangePassword },
      };
    },

    /**
     * Mengganti kata sandi sendiri. Kata sandi lama wajib benar (dan salah ketik dihitung seperti gagal
     * login, supaya pembajak sesi tidak bisa menebak tanpa batas). Sesi lain milik pengguna dicabut.
     */
    async changePassword(
      userId: string,
      currentSessionId: string,
      input: { currentPassword: string; newPassword: string },
      meta: { userAgent?: string | null } = {},
    ): Promise<ChangePasswordResult> {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.passwordHash || !user.isActive || user.deletedAt) {
        return { ok: false, code: "WRONG_CURRENT", message: "Kata sandi saat ini salah." };
      }
      if (user.lockedUntil && user.lockedUntil > now()) {
        return { ok: false, code: "LOCKED", message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
      }
      if (input.currentPassword.length > MAX_INPUT_LENGTH || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
        await recordFailure(user.id, meta.userAgent ?? null, "wrong_current_password");
        return { ok: false, code: "WRONG_CURRENT", message: "Kata sandi saat ini salah." };
      }
      const problem = checkPasswordPolicy(input.newPassword, { email: user.email, name: user.name });
      if (problem) return { ok: false, code: "WEAK_PASSWORD", message: problem };
      if (input.newPassword === input.currentPassword) {
        return { ok: false, code: "SAME_PASSWORD", message: "Kata sandi baru harus berbeda dari yang lama." };
      }

      const hash = await hashPassword(input.newPassword);
      await db
        .update(users)
        .set({ passwordHash: hash, passwordChangedAt: now(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
      await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSessionId)));
      await recordAudit(db, {
        actorId: user.id,
        action: "auth.password_changed",
        entityType: "user",
        entityId: user.id,
        userAgent: meta.userAgent ?? null,
      });
      return { ok: true };
    },
  };
}

export type LocalAuth = ReturnType<typeof createLocalAuth>;
