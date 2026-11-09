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

/** Penyaring katalog. Semua opsional; nilai yang tidak dikenal menghasilkan daftar kosong, bukan galat. */
export interface CatalogFilters {
  /** Slug kategori / fakultas / program studi / jenis. */
  category?: string;
  faculty?: string;
  studyProgram?: string;
  type?: string;
  year?: number;
  /** true = hanya yang memiliki HKI/paten. */
  hasIp?: boolean;
}

export type CatalogSort = "newest" | "relevance";

export interface CatalogQuery extends CatalogFilters {
  q?: string;
  /** `relevance` hanya bermakna bila ada `q`; selain itu diperlakukan sebagai `newest`. */
  sort?: CatalogSort;
  page: number;
  perPage: number;
}

export interface FacetOption {
  slug: string;
  name: string;
  count: number;
}

/** Pilihan penyaring yang benar-benar punya inovasi terbit (tidak ada pilihan yang pasti kosong). */
export interface CatalogFacets {
  categories: FacetOption[];
  faculties: FacetOption[];
  studyPrograms: (FacetOption & { facultyName: string | null })[];
  types: FacetOption[];
  years: { year: number; count: number }[];
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
export interface CatalogDocument {
  id: string;
  title: string;
  sizeBytes: number;
}

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
  /** Dokumen yang ditetapkan operator sebagai publik. Berkas restricted tidak pernah ikut. */
  documents: CatalogDocument[];
  members: CatalogMember[];
  publications: CatalogPublication[];
  intellectualProperties: CatalogIp[];
  publishedAt: string | null;
}

/** Sumber data katalog. Implementasi PostgreSQL menyusul setelah database terverifikasi. */
export interface CatalogProvider {
  search(query: CatalogQuery): Promise<CatalogPage>;
  home(): Promise<HomeData>;
  /** Opsi penyaring untuk halaman katalog. */
  facets(): Promise<CatalogFacets>;
  /** null bila slug tidak ada atau inovasinya belum/tidak lagi published. */
  getBySlug(slug: string): Promise<CatalogDetail | null>;
  /** Seluruh inovasi published untuk sitemap. updatedAt dalam ISO 8601. */
  listSlugs(): Promise<{ slug: string; updatedAt: string }[]>;
}
