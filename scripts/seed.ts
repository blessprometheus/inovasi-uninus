/**
 * Seed produksi (aman dijalankan berulang): roles, permissions, role_permissions.
 * Jalankan: npm run db:seed   (membaca DATABASE_URL dari .env.local)
 * Data dummy dev TIDAK ada di sini (dibuat terpisah dan tidak boleh jalan di produksi).
 */
import { createDatabase } from "../src/platform/db/client";
import { seedRbac } from "../src/platform/db/seed/rbac";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diatur.");
  const { db, pool } = createDatabase(url, { max: 1 });
  try {
    await seedRbac(db);
    console.log("Seed RBAC selesai.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
