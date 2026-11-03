import type { CatalogItem } from "@/modules/catalog/types";

/** Kartu direktori. NIDN/NIP tidak pernah masuk ke bentuk data publik (skema: identifier). */
export interface ResearcherItem {
  slug: string;
  fullName: string;
  position: string | null;
  facultyName: string | null;
  studyProgramName: string | null;
  innovationCount: number;
}

export interface ResearcherDetail extends ResearcherItem {
  /** Diisi dari SSO bila tersedia (OQ-02); kosong tidak ditampilkan. */
  bio: string | null;
  /** Hanya tautan http/https; divalidasi di sumber data. */
  externalLinks: { label: string; url: string }[];
  innovations: CatalogItem[];
}

export interface ResearcherQuery {
  q?: string;
  page: number;
  perPage: number;
}

export interface ResearcherProvider {
  search(query: ResearcherQuery): Promise<{ items: ResearcherItem[]; total: number }>;
  /** null bila tidak ada atau profilnya tidak publik. */
  getBySlug(slug: string): Promise<ResearcherDetail | null>;
  /** Seluruh peneliti publik untuk sitemap. updatedAt dalam ISO 8601. */
  listSlugs(): Promise<{ slug: string; updatedAt: string }[]>;
}
