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

export interface CatalogMember {
  name: string;
  role: "lead" | "member";
}

export interface CatalogPublication {
  title: string;
  url: string | null;
  doi: string | null;
  venue: string | null;
  year: number | null;
}

export interface CatalogIp {
  kind: string;
  status: string | null;
  registrationNumber: string | null;
  year: number | null;
}

/** Bagian teks panjang berurutan sesuai halaman detail. Bagian kosong tidak ditampilkan. */
export interface CatalogDetail extends CatalogItem {
  typeName: string | null;
  studyProgramName: string | null;
  abstract: string | null;
  background: string | null;
  problemStatement: string | null;
  objective: string | null;
  methodology: string | null;
  description: string | null;
  advantages: string | null;
  benefits: string | null;
  developmentPotential: string | null;
  members: CatalogMember[];
  publications: CatalogPublication[];
  intellectualProperties: CatalogIp[];
  publishedAt: string | null;
}

/** Sumber data katalog. Implementasi PostgreSQL menyusul setelah database terverifikasi. */
export interface CatalogProvider {
  search(query: CatalogQuery): Promise<CatalogPage>;
  home(): Promise<HomeData>;
  /** null bila slug tidak ada atau inovasinya belum/tidak lagi published. */
  getBySlug(slug: string): Promise<CatalogDetail | null>;
  /** Seluruh inovasi published untuk sitemap. updatedAt dalam ISO 8601. */
  listSlugs(): Promise<{ slug: string; updatedAt: string }[]>;
}
