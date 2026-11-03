import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];

/** Membuat koneksi. Pemanggil bertanggung jawab menutup `pool` (skrip dan tes). */
export function createDatabase(connectionString: string, options: { max?: number } = {}) {
  const pool = new Pool({ connectionString, max: options.max ?? 5 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

declare global {
  var __inovasiDb: ReturnType<typeof createDatabase> | undefined;
}

/** Koneksi tunggal untuk aplikasi (aman terhadap hot reload saat pengembangan). */
export function getDb(): Database {
  if (!globalThis.__inovasiDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum diatur.");
    // Batas koneksi kecil: server dipakai bersama aplikasi lain (docs/DEPLOYMENT.md).
    globalThis.__inovasiDb = createDatabase(url, { max: 5 });
  }
  return globalThis.__inovasiDb.db;
}
