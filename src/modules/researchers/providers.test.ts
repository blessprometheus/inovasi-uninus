import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dummyResearcherProvider,
  emptyResearcherProvider,
  getResearcherProvider,
} from "./providers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getResearcherProvider", () => {
  it("kosong secara default", () => {
    vi.stubEnv("DUMMY_DATA", "");
    expect(getResearcherProvider()).toBe(emptyResearcherProvider);
  });

  it("dummy hanya bila DUMMY_DATA=1 di luar produksi", () => {
    vi.stubEnv("DUMMY_DATA", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(getResearcherProvider()).toBe(dummyResearcherProvider);
    vi.stubEnv("NODE_ENV", "production");
    expect(getResearcherProvider()).toBe(emptyResearcherProvider);
  });
});

describe("provider peneliti", () => {
  it("provider kosong: tidak ada hasil dan tidak ada profil", async () => {
    expect(await emptyResearcherProvider.search({ page: 1, perPage: 12 })).toEqual({
      items: [],
      total: 0,
    });
    expect(await emptyResearcherProvider.getBySlug("dummy-peneliti-1")).toBeNull();
  });

  it("semua teks dummy berawalan [DUMMY] dan tidak membawa NIDN/NIP", async () => {
    const { items } = await dummyResearcherProvider.search({ page: 1, perPage: 100 });
    for (const r of items) {
      expect(r.fullName.startsWith("[DUMMY]")).toBe(true);
      expect(r).not.toHaveProperty("identifier");
    }
  });

  it("profil dummy memuat inovasi sebanyak innovationCount; slug asing null", async () => {
    const d = await dummyResearcherProvider.getBySlug("dummy-peneliti-4");
    expect(d?.innovations).toHaveLength(d?.innovationCount ?? -1);
    for (const l of d?.externalLinks ?? []) expect(l.url).toMatch(/^https?:\/\//);
    expect(await dummyResearcherProvider.getBySlug("tidak-ada")).toBeNull();
  });

  it("pencarian dan paginasi bekerja", async () => {
    const p1 = await dummyResearcherProvider.search({ page: 1, perPage: 12 });
    const p2 = await dummyResearcherProvider.search({ page: 2, perPage: 12 });
    expect(p1.items).toHaveLength(12);
    expect(p2.items).toHaveLength(p1.total - 12);
    expect(await dummyResearcherProvider.search({ q: "zzz", page: 1, perPage: 12 })).toEqual({
      items: [],
      total: 0,
    });
  });
});
