import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tes unit (tanpa database). Tes integrasi: vitest.integration.config.mts
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts", "node_modules/**"],
  },
});
