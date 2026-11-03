import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl, isIndexable } from "./site";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSiteUrl", () => {
  it("memakai origin APP_URL tanpa garis miring akhir", () => {
    vi.stubEnv("APP_URL", "https://inovasi.uninus.ac.id/");
    expect(getSiteUrl()).toBe("https://inovasi.uninus.ac.id");
  });

  it("jatuh ke default lokal bila kosong, tidak valid, atau bukan http(s)", () => {
    for (const bad of ["", "bukan-url", "javascript:alert(1)", "ftp://x.test"]) {
      vi.stubEnv("APP_URL", bad);
      expect(getSiteUrl()).toBe("http://localhost:3000");
    }
  });
});

describe("isIndexable", () => {
  it("hanya true saat APP_ENV=production", () => {
    vi.stubEnv("APP_ENV", "production");
    expect(isIndexable()).toBe(true);
    for (const env of ["staging", "development", ""]) {
      vi.stubEnv("APP_ENV", env);
      expect(isIndexable()).toBe(false);
    }
  });
});
