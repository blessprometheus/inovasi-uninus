/**
 * Menerapkan migrasi SQL di folder drizzle/. Jalankan: npm run db:migrate
 * Target: DATABASE_URL. Backup wajib sebelum menjalankan di produksi (docs/DEPLOYMENT.md §5).
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/platform/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diatur.");
  const { db, pool } = createDatabase(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrasi selesai.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
