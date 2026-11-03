const DEFAULT_URL = "http://localhost:3000";

/** URL dasar situs tanpa garis miring akhir. Diisi dari APP_URL; tidak valid jatuh ke default lokal. */
export function getSiteUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return DEFAULT_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_URL;
    return url.origin;
  } catch {
    return DEFAULT_URL;
  }
}

/** Hanya lingkungan produksi yang boleh diindeks mesin pencari; staging dan lokal tidak. */
export function isIndexable(): boolean {
  return process.env.APP_ENV === "production";
}
