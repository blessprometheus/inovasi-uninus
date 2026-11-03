import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client";

/**
 * Koneksi untuk tes integrasi. Menolak database yang namanya tidak berakhiran `_test`
 * supaya tes tidak pernah menghapus data pengembangan atau produksi.
 */
export async function setupTestDb() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST belum diatur (lihat .env.example).");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`Database tes harus berakhiran "_test", ditemukan "${dbName}".`);
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST tidak boleh sama dengan DATABASE_URL.");
  }

  const { db, pool } = createDatabase(url, { max: 2 });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, pool };
}

/** Mengosongkan semua tabel aplikasi (bukan tabel migrasi) sebelum tiap tes. */
export async function resetTestDb(db: Awaited<ReturnType<typeof setupTestDb>>["db"]) {
  const result = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = result.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
}
