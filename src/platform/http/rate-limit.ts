/**
 * Pembatas laju sederhana di memori (jendela geser). Cukup untuk satu proses Node.js (ADR-001);
 * bila aplikasi dijalankan lebih dari satu proses, batasnya berlaku per proses. Tidak menyimpan apa pun
 * ke disk. Kunci yang sudah kedaluwarsa dibuang agar peta tidak membengkak.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }) {
  const hits = new Map<string, number[]>();
  const now = options.now ?? Date.now;
  const MAX_KEYS = 10_000;

  return {
    /** True bila permintaan ini masih diperbolehkan (dan dihitung). */
    allow(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < options.windowMs);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > MAX_KEYS) {
        for (const [k, v] of hits) if (v.every((x) => t - x >= options.windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
