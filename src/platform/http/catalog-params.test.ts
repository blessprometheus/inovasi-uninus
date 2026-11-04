import { describe, expect, it } from "vitest";
import { activeFilterCount, catalogQueryString, parseCatalogParams } from "./catalog-params";

describe("parseCatalogParams", () => {
  it("default: tanpa penyaring, urut terbaru, halaman 1", () => {
    expect(parseCatalogParams({})).toEqual({
      q: undefined,
      category: undefined,
      faculty: undefined,
      studyProgram: undefined,
      type: undefined,
      year: undefined,
      hasIp: undefined,
      sort: "newest",
      page: 1,
    });
  });

  it("membaca semua penyaring yang valid", () => {
    const p = parseCatalogParams({
      q: "  padi ",
      kategori: "pertanian",
      fakultas: "fakultas-teknik",
      prodi: "teknik-informatika",
      jenis: "produk",
      tahun: "2024",
      hki: "1",
      urut: "terbaru",
      page: "3",
    });
    expect(p).toMatchObject({
      q: "padi",
      category: "pertanian",
      faculty: "fakultas-teknik",
      studyProgram: "teknik-informatika",
      type: "produk",
      year: 2024,
      hasIp: true,
      sort: "newest",
      page: 3,
    });
  });

  it("nilai yang bentuknya salah dibuang, bukan menyebabkan galat", () => {
    const p = parseCatalogParams({
      kategori: "Besar Kecil!",
      fakultas: "x'; drop table--",
      prodi: "a".repeat(200),
      jenis: ["../etc", "ok"],
      tahun: "20x4",
      hki: "ya",
      page: "-5",
    });
    expect(p).toMatchObject({
      category: undefined,
      faculty: undefined,
      studyProgram: undefined,
      type: undefined,
      year: undefined,
      hasIp: undefined,
      page: 1,
    });
  });

  it("tahun di luar 1900-2100 ditolak; array memakai elemen pertama", () => {
    expect(parseCatalogParams({ tahun: "1899" }).year).toBeUndefined();
    expect(parseCatalogParams({ tahun: "2101" }).year).toBeUndefined();
    expect(parseCatalogParams({ tahun: "1900" }).year).toBe(1900);
    expect(parseCatalogParams({ kategori: ["satu", "dua"] }).category).toBe("satu");
  });

  it("dengan kata kunci urutan bawaan relevansi; urut=terbaru mengubahnya; tanpa kata kunci selalu terbaru", () => {
    expect(parseCatalogParams({ urut: "terbaru" }).sort).toBe("newest");
    expect(parseCatalogParams({ q: "x" }).sort).toBe("relevance");
    expect(parseCatalogParams({ q: "x", urut: "terbaru" }).sort).toBe("newest");
    expect(parseCatalogParams({ q: "x", urut: "acak" }).sort).toBe("relevance");
    expect(parseCatalogParams({ page: "999999" }).page).toBe(10_000);
    expect(parseCatalogParams({ q: "a".repeat(300) }).q).toHaveLength(100);
  });
});

describe("catalogQueryString dan activeFilterCount", () => {
  it("menyusun query dengan perubahan dan membuang nilai kosong", () => {
    const p = parseCatalogParams({ q: "padi", kategori: "pertanian", tahun: "2024", page: "2" });
    expect(catalogQueryString(p)).toBe("q=padi&kategori=pertanian&tahun=2024&page=2");
    expect(catalogQueryString(p, { year: undefined, page: 1 })).toBe("q=padi&kategori=pertanian");
    expect(catalogQueryString(parseCatalogParams({}))).toBe("");
    expect(catalogQueryString(parseCatalogParams({ q: "padi", urut: "terbaru" }))).toBe("q=padi&urut=terbaru");
    expect(catalogQueryString(parseCatalogParams({ q: "padi" }))).toBe("q=padi");
  });

  it("menghitung penyaring aktif tanpa q, urutan, atau halaman", () => {
    expect(activeFilterCount(parseCatalogParams({ q: "x", page: "4" }))).toBe(0);
    expect(activeFilterCount(parseCatalogParams({ kategori: "a", fakultas: "b", hki: "1" }))).toBe(3);
  });
});
