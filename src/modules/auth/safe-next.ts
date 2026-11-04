const FALLBACK = "/dosen";

/**
 * Tujuan setelah login dari parameter `next`. Hanya jalur internal yang diterima, supaya halaman
 * login tidak bisa dipakai mengalihkan pengguna ke situs lain (open redirect).
 */
export function safeNextPath(raw: string | string[] | null | undefined, fallback: string = FALLBACK): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.length > 300) return fallback;
  // Harus diawali satu "/" saja: "//host" dan "/\host" ditafsirkan browser sebagai host lain.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  // Jangan kembali ke halaman login atau rute API.
  if (value.startsWith("/masuk") || value.startsWith("/api/")) return fallback;
  return value;
}
