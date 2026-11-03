import { dummyCatalogProvider } from "@/modules/catalog/providers";
import type { ResearcherDetail, ResearcherItem, ResearcherProvider } from "./types";

/** Keadaan awal produksi: belum ada peneliti terdaftar (D-03). */
export const emptyResearcherProvider: ResearcherProvider = {
  async search() {
    return { items: [], total: 0 };
  },
  async getBySlug() {
    return null;
  },
};

const DUMMY_RESEARCHERS: ResearcherItem[] = Array.from({ length: 14 }, (_, i) => ({
  slug: `dummy-peneliti-${i + 1}`,
  fullName: `[DUMMY] Nama Peneliti ${i + 1}`,
  position: "[DUMMY] Jabatan fungsional",
  facultyName: "[DUMMY] Fakultas",
  studyProgramName: "[DUMMY] Program Studi",
  innovationCount: i % 4,
}));

/** Hanya untuk pengembangan lokal. Semua teksnya berawalan [DUMMY]. */
export const dummyResearcherProvider: ResearcherProvider = {
  async search({ q, page, perPage }) {
    const needle = q?.trim().toLowerCase();
    const filtered = needle
      ? DUMMY_RESEARCHERS.filter((r) => r.fullName.toLowerCase().includes(needle))
      : DUMMY_RESEARCHERS;
    const start = (page - 1) * perPage;
    return { items: filtered.slice(start, start + perPage), total: filtered.length };
  },
  async getBySlug(slug): Promise<ResearcherDetail | null> {
    const item = DUMMY_RESEARCHERS.find((r) => r.slug === slug);
    if (!item) return null;
    const { items } = await dummyCatalogProvider.search({ page: 1, perPage: item.innovationCount });
    return {
      ...item,
      bio: "[DUMMY] Profil singkat contoh untuk menguji tampilan.",
      externalLinks: [{ label: "[DUMMY] Profil eksternal", url: "https://example.com/" }],
      innovations: items,
    };
  },
};

/** Aturan yang sama dengan katalog: dummy tidak pernah aktif di produksi. */
export function getResearcherProvider(): ResearcherProvider {
  if (process.env.DUMMY_DATA === "1" && process.env.NODE_ENV !== "production") {
    return dummyResearcherProvider;
  }
  return emptyResearcherProvider;
}
