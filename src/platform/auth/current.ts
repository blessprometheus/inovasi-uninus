import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getSiteUrl } from "@/platform/config/site";
import { getDb } from "@/platform/db/client";
import { readSessionToken, sessionCookieName } from "./cookie";
import { createCsrfToken } from "./csrf";
import { requireAuthSecret } from "./handlers";
import { findSession, type ActiveSession } from "./session-store";

/**
 * Sesi untuk Server Component. Dicache per request supaya header dan halaman tidak memeriksa dua kali.
 * Kegagalan infrastruktur (database mati, env belum diisi) dianggap tidak login, agar halaman publik
 * tetap tampil; halaman yang butuh login akan mengarahkan ke /masuk.
 */
export const getCurrentSession = cache(async (): Promise<ActiveSession | null> => {
  const appUrl = getSiteUrl();
  const store = await cookies();
  const value = store.get(sessionCookieName(appUrl))?.value;
  if (!value) return null;
  const token = readSessionToken(`${sessionCookieName(appUrl)}=${value}`, appUrl);
  if (!token || !process.env.DATABASE_URL) return null;
  // Masa berlaku sesi dibandingkan dengan waktu sekarang, jadi ini harus dihitung saat request, bukan saat prerender.
  await connection();
  try {
    return await findSession(getDb(), token);
  } catch (error) {
    console.error("Gagal memuat sesi", error);
    return null;
  }
});

/** Untuk halaman terlindungi: tanpa sesi, arahkan ke login dan kembali ke halaman ini setelahnya. */
export async function requireSession(returnTo: string): Promise<ActiveSession> {
  const session = await getCurrentSession();
  if (!session) redirect(`/masuk?next=${encodeURIComponent(returnTo)}`);
  return session;
}

/** Token CSRF untuk komponen klien milik sesi ini. */
export function csrfTokenFor(session: ActiveSession): string {
  return createCsrfToken(session.sessionId, requireAuthSecret());
}
