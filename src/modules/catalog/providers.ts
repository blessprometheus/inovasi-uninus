import { getDb } from "@/platform/db/client";
import { createPgCatalogProvider } from "./pg-provider";
import type { CatalogItem, CatalogProvider, CatalogQuery } from "./types";

/** Keadaan awal produksi: belum ada data (D-03). Seluruh UI harus anggun saat kosong. */
export const emptyCatalogProvider: CatalogProvider = {
  async search() {
    return { items: [], total: 0 };
  },
  async facets() {
    return { categories: [], faculties: [], studyPrograms: [], types: [], years: [] };
  },
  async home() {
    return { featured: [], latest: [], stats: null };
  },
  async getBySlug() {
    return null;
  },
  async listSlugs() {
    return [];
  },
};

const DUMMY_ITEMS: CatalogItem[] = Array.from({ length: 14 }, (_, i) => ({
  slug: `dummy-inovasi-${i + 1}`,
  title: `[DUMMY] Contoh judul inovasi nomor ${i + 1}`,
  summary:
    "[DUMMY] Teks contoh untuk menguji tampilan kartu katalog. Bukan data penelitian UNINUS yang sebenarnya.",
  categoryName: "[DUMMY] Kategori",
  leadResearcherName: "[DUMMY] Nama Peneliti",
  facultyName: "[DUMMY] Fakultas",
  year: 2020 + (i % 6),
  hasIp: i % 3 === 0,
  coverUrl: null,
  coverAlt: null,
}));

/** Hanya untuk pengembangan lokal. Semua teksnya berawalan [DUMMY]. */
export const dummyCatalogProvider: CatalogProvider = {
  async search({ q, page, perPage, year, hasIp, category, faculty, studyProgram, type }: CatalogQuery) {
    const needle = q?.trim().toLowerCase();
    // Data contoh hanya punya tahun dan HKI; penyaring berbasis slug taksonomi tidak punya padanan,
    // jadi dianggap tidak cocok (sama seperti slug yang tidak dikenal di PostgreSQL).
    if (category || faculty || studyProgram || type) return { items: [], total: 0 };
    const filtered = DUMMY_ITEMS.filter(
      (it) =>
        (!needle || `${it.title} ${it.summary}`.toLowerCase().includes(needle)) &&
        (year === undefined || it.year === year) &&
        (!hasIp || it.hasIp),
    );
    const start = (page - 1) * perPage;
    return { items: filtered.slice(start, start + perPage), total: filtered.length };
  },
  async facets() {
    const counts = new Map<number, number>();
    for (const it of DUMMY_ITEMS) if (it.year) counts.set(it.year, (counts.get(it.year) ?? 0) + 1);
    return {
      categories: [],
      faculties: [],
      studyPrograms: [],
      types: [],
      years: [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year),
    };
  },
  async home() {
    return {
      featured: DUMMY_ITEMS.slice(0, 3),
      latest: DUMMY_ITEMS.slice(3, 9),
      stats: { innovations: DUMMY_ITEMS.length, researchers: 0, faculties: 0 },
    };
  },
  async getBySlug(slug: string) {
    const item = DUMMY_ITEMS.find((it) => it.slug === slug);
    if (!item) return null;
    return {
      ...item,
      typeName: "[DUMMY] Jenis inovasi",
      studyProgramName: "[DUMMY] Program Studi",
      abstract: "[DUMMY] Abstrak contoh untuk menguji tata letak halaman detail.",
      background: "[DUMMY] Latar belakang contoh.\n\nParagraf kedua untuk menguji pemisah paragraf.",
      problemStatement: null,
      objective: "[DUMMY] Tujuan contoh.",
      methodology: null,
      description: "[DUMMY] Deskripsi contoh.",
      advantages: null,
      benefits: "[DUMMY] Manfaat contoh.",
      developmentPotential: null,
      members: [
        { name: "[DUMMY] Nama Peneliti", role: "lead" },
        { name: "[DUMMY] Anggota Tim", role: "member" },
      ],
      publications: [
        {
          title: "[DUMMY] Judul publikasi contoh",
          url: "https://example.com/",
          doi: null,
          venue: "[DUMMY] Nama jurnal",
          year: 2023,
        },
      ],
      intellectualProperties: item.hasIp
        ? [{ kind: "[DUMMY] HKI", status: "[DUMMY] Status", registrationNumber: null, year: item.year }]
        : [],
      publishedAt: "2024-01-15T00:00:00.000Z",
    };
  },
  async listSlugs() {
    return DUMMY_ITEMS.map((it) => ({ slug: it.slug, updatedAt: "2024-01-15T00:00:00.000Z" }));
  },
};

/**
 * Urutan pilihan: dummy (hanya bila DUMMY_DATA=1 DAN bukan produksi; di produksi nilai itu diabaikan,
 * AGENTS.md §7) -> PostgreSQL bila DATABASE_URL terisi -> kosong (keadaan sebelum database disiapkan).
 */
export function getCatalogProvider(): CatalogProvider {
  if (process.env.DUMMY_DATA === "1" && process.env.NODE_ENV !== "production") {
    return dummyCatalogProvider;
  }
  if (process.env.DATABASE_URL) return createPgCatalogProvider(getDb());
  return emptyCatalogProvider;
}
