/** Bentuk data kartu katalog publik. Hanya inovasi berstatus published yang pernah sampai ke sini. */
export interface CatalogItem {
  slug: string;
  title: string;
  summary: string;
  categoryName: string | null;
  leadResearcherName: string | null;
  facultyName: string | null;
  year: number | null;
  hasIp: boolean;
  coverUrl: string | null;
  coverAlt: string | null;
}

export interface CatalogQuery {
  q?: string;
  page: number;
  perPage: number;
}

export interface CatalogPage {
  items: CatalogItem[];
  total: number;
}

export interface HomeData {
  featured: CatalogItem[];
  latest: CatalogItem[];
  stats: { innovations: number; researchers: number; faculties: number } | null;
}

/** Sumber data katalog. Implementasi PostgreSQL menyusul setelah database terverifikasi. */
export interface CatalogProvider {
  search(query: CatalogQuery): Promise<CatalogPage>;
  home(): Promise<HomeData>;
}
