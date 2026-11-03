import { defineConfig } from "drizzle-kit";

// DATABASE_URL dibaca dari environment (lihat package.json: skrip db:* memuat .env.local).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/platform/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
