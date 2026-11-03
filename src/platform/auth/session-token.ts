import { createHash, randomBytes } from "node:crypto";

/**
 * Token sesi opaque 256-bit. Token mentah hanya dikirim ke browser lewat cookie;
 * database hanya menyimpan hash-nya (docs/SYSTEM_ARCHITECTURE.md §4).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionLifetime {
  /** Batas absolut sejak dibuat. */
  absoluteMs: number;
  /** Batas tidak aktif. */
  idleMs: number;
}

/** Usulan awal (docs/SECURITY.md §2): 8 jam absolut, 60 menit idle. */
export const DEFAULT_SESSION_LIFETIME: SessionLifetime = {
  absoluteMs: 8 * 60 * 60 * 1000,
  idleMs: 60 * 60 * 1000,
};

export function newSessionExpiry(now: Date, lifetime: SessionLifetime = DEFAULT_SESSION_LIFETIME) {
  return {
    expiresAt: new Date(now.getTime() + lifetime.absoluteMs),
    idleExpiresAt: new Date(now.getTime() + lifetime.idleMs),
  };
}

export function isSessionValid(
  session: { expiresAt: Date; idleExpiresAt: Date },
  now: Date,
): boolean {
  return now < session.expiresAt && now < session.idleExpiresAt;
}

/** Perpanjang batas idle tanpa pernah melewati batas absolut. */
export function slideIdleExpiry(
  session: { expiresAt: Date },
  now: Date,
  lifetime: SessionLifetime = DEFAULT_SESSION_LIFETIME,
): Date {
  const next = new Date(now.getTime() + lifetime.idleMs);
  return next < session.expiresAt ? next : session.expiresAt;
}
