const SECURE_NAME = "__Host-inovasi_session";
const PLAIN_NAME = "inovasi_session";

/**
 * Awalan `__Host-` mewajibkan Secure, jadi hanya dipakai bila aplikasi berjalan di https.
 * Lokal (http://localhost) memakai nama biasa supaya browser tidak menolak cookie.
 */
export function isSecureContext(appUrl: string): boolean {
  try {
    return new URL(appUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookieName(appUrl: string): string {
  return isSecureContext(appUrl) ? SECURE_NAME : PLAIN_NAME;
}

/** Cookie sesi: HttpOnly, SameSite=Lax, path "/", Secure di https. Nilai token base64url, aman tanpa encoding. */
export function serializeSessionCookie(token: string, appUrl: string, maxAgeSeconds: number): string {
  const parts = [
    `${sessionCookieName(appUrl)}=${token}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isSecureContext(appUrl)) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(appUrl: string): string {
  return serializeSessionCookie("", appUrl, 0);
}

/** Mengambil token sesi dari header Cookie. Mengembalikan null bila tidak ada atau bentuknya aneh. */
export function readSessionToken(cookieHeader: string | null, appUrl: string): string | null {
  if (!cookieHeader) return null;
  const name = sessionCookieName(appUrl);
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
  }
  return null;
}
