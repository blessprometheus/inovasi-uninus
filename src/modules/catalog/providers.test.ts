import { afterEach, describe, expect, it, vi } from "vitest";
import { dummyCatalogProvider, emptyCatalogProvider, getCatalogProvider } from "./providers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getCatalogProvider", () => {
  it("kosong bila tidak ada dummy dan tidak ada DATABASE_URL", () => {
    vi.stubEnv("DUMMY_DATA", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(getCatalogProvider()).toBe(emptyCatalogProvider);
  });

  it("memakai PostgreSQL bila DATABASE_URL terisi dan dummy mati", () => {
    vi.stubEnv("DUMMY_DATA", "");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/tidak_dipakai");
    const provider = getCatalogProvider();
    expect(provider).not.toBe(emptyCatalogProvider);
    expect(provider).not.toBe(dummyCatalogProvider);
  });

  it("memakai data dummy hanya bila DUMMY_DATA=1 di luar produksi", () => {
    vi.stubEnv("DUMMY_DATA", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(getCatalogProvider()).toBe(dummyCatalogProvider);
  });

  it("mengabaikan DUMMY_DATA=1 di produksi, dummy tidak pernah tampil sebagai data asli", () => {
    vi.stubEnv("DUMMY_DATA", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    expect(getCatalogProvider()).toBe(emptyCatalogProvider);
  });
});

describe("provider katalog", () => {
  it("provider kosong mengembalikan hasil kosong dan statistik null", async () => {
    expect(await emptyCatalogProvider.search({ page: 1, perPage: 12 })).toEqual({ items: [], total: 0 });
    expect(await emptyCatalogProvider.home()).toEqual({ featured: [], latest: [], stats: null });
  });

  it("semua teks dummy berawalan [DUMMY]", async () => {
    const { items } = await dummyCatalogProvider.search({ page: 1, perPage: 100 });
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.title.startsWith("[DUMMY]")).toBe(true);
      expect(it.summary.startsWith("[DUMMY]")).toBe(true);
    }
  });

  it("provider kosong tidak pernah menemukan slug apa pun", async () => {
    expect(await emptyCatalogProvider.getBySlug("dummy-inovasi-1")).toBeNull();
  });

  it("detail dummy: slug dikenal ditemukan, tidak dikenal null, semua teks berawalan [DUMMY]", async () => {
    expect(await dummyCatalogProvider.getBySlug("tidak-ada")).toBeNull();
    const d = await dummyCatalogProvider.getBySlug("dummy-inovasi-1");
    expect(d).not.toBeNull();
    const texts = [
      d?.title,
      d?.abstract,
      d?.background,
      d?.objective,
      d?.description,
      d?.benefits,
      ...(d?.members.map((m) => m.name) ?? []),
      ...(d?.publications.map((p) => p.title) ?? []),
    ].filter(Boolean) as string[];
    for (const t of texts) expect(t.startsWith("[DUMMY]")).toBe(true);
  });

  it("paginasi dan pencarian dummy bekerja", async () => {
    const p1 = await dummyCatalogProvider.search({ page: 1, perPage: 12 });
    const p2 = await dummyCatalogProvider.search({ page: 2, perPage: 12 });
    expect(p1.items).toHaveLength(12);
    expect(p2.items).toHaveLength(p1.total - 12);
    const none = await dummyCatalogProvider.search({ q: "tidak-ada-yang-cocok", page: 1, perPage: 12 });
    expect(none).toEqual({ items: [], total: 0 });
  });
});
