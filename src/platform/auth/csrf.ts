import { createHmac, timingSafeEqual } from "node:crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isStateChangingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Pemeriksaan asal permintaan (docs/API_DOCUMENTATION.md §2). Permintaan pengubah data wajib
 * punya header Origin yang sama persis dengan origin aplikasi. Tanpa Origin ditolak.
 */
export function isAllowedOrigin(originHeader: string | null, appUrl: string): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

/** Token CSRF terikat ke sesi: HMAC(secret, sessionId). Tidak perlu penyimpanan tambahan. */
export function createCsrfToken(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("base64url");
}

export function verifyCsrfToken(token: string | null, sessionId: string, secret: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(createCsrfToken(sessionId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
