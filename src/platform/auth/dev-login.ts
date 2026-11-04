/**
 * Login pengembangan (docs/SECURITY.md §2): jalur masuk tanpa SSO supaya dashboard bisa dikembangkan
 * sebelum client OIDC tersedia. Harus mustahil aktif di produksi.
 */

type Env = Record<string, string | undefined>;

/** Aktif hanya bila DIMINTA (DEV_LOGIN=1) dan lingkungan benar-benar pengembangan. */
export function isDevLoginEnabled(env: Env = process.env): boolean {
  return env.DEV_LOGIN === "1" && env.APP_ENV === "development" && env.NODE_ENV !== "production";
}

/**
 * Dipanggil saat server start. DEV_LOGIN=1 di luar pengembangan adalah salah konfigurasi yang
 * berbahaya, jadi aplikasi menolak berjalan alih-alih diam-diam menutup fiturnya.
 */
export function assertDevLoginSafe(env: Env = process.env): void {
  if (env.DEV_LOGIN === "1" && !isDevLoginEnabled(env)) {
    throw new Error(
      "DEV_LOGIN=1 hanya boleh dengan APP_ENV=development dan bukan mode produksi. Hapus DEV_LOGIN dari environment ini.",
    );
  }
}
