import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tes integrasi memakai PostgreSQL asli (DATABASE_URL_TEST). Jalankan: npm run test:integration
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    // Semua file berbagi satu database tes, jadi dijalankan berurutan.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
