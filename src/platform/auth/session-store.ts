import { and, eq, gt } from "drizzle-orm";
import type { PermissionCode } from "@/modules/auth/permissions";
import type { Database } from "@/platform/db/client";
import { permissions, rolePermissions, roles, sessions, userRoles, users } from "@/platform/db/schema";
import {
  DEFAULT_SESSION_LIFETIME,
  generateSessionToken,
  hashSessionToken,
  isSessionValid,
  newSessionExpiry,
  slideIdleExpiry,
  type SessionLifetime,
} from "./session-token";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Akun baru atau yang sandinya diatur ulang: wajib ganti sandi sebelum memakai fitur lain. */
  mustChangePassword: boolean;
  roles: string[];
  permissions: ReadonlySet<PermissionCode>;
}

export interface ActiveSession {
  sessionId: string;
  expiresAt: Date;
  user: SessionUser;
}

/** Perpanjangan idle ditulis ke database paling cepat sekali per menit supaya tiap request tidak menulis. */
const SLIDE_WRITE_THRESHOLD_MS = 60 * 1000;

export async function createSession(
  db: Database,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
  now: Date = new Date(),
  lifetime: SessionLifetime = DEFAULT_SESSION_LIFETIME,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const { expiresAt, idleExpiresAt } = newSessionExpiry(now, lifetime);
  await db.insert(sessions).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt,
    idleExpiresAt,
    ip: meta.ip ?? null,
    // Dibatasi agar header berukuran besar tidak membengkakkan tabel.
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, userId));
  return { token, expiresAt };
}

/**
 * Mencari sesi dari token mentah. Null bila token tidak dikenal, kedaluwarsa (absolut/idle),
 * atau akun dinonaktifkan/dihapus. Sesi yang masih berlaku diperpanjang idle-nya.
 */
export async function findSession(
  db: Database,
  token: string,
  now: Date = new Date(),
  lifetime: SessionLifetime = DEFAULT_SESSION_LIFETIME,
): Promise<ActiveSession | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      idleExpiresAt: sessions.idleExpiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now)));

  if (!row || !isSessionValid(row, now)) return null;
  if (!row.isActive || row.deletedAt) return null;

  const grants = await db
    .select({ role: roles.code, permission: permissions.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, row.userId));

  const next = slideIdleExpiry(row, now, lifetime);
  if (next.getTime() - row.idleExpiresAt.getTime() >= SLIDE_WRITE_THRESHOLD_MS) {
    await db.update(sessions).set({ idleExpiresAt: next }).where(eq(sessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      mustChangePassword: row.mustChangePassword,
      roles: [...new Set(grants.map((g) => g.role))],
      permissions: new Set(grants.flatMap((g) => (g.permission ? [g.permission as PermissionCode] : []))),
    },
  };
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Dipakai saat akun dinonaktifkan atau role diubah. */
export async function revokeUserSessions(db: Database, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
