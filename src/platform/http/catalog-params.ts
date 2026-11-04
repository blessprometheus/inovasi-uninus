import type { CatalogFilters, CatalogSort } from "@/modules/catalog/types";

type RawParam = string | string[] | undefined;
type RawParams = Record<string, RawParam>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 160;

function first(v: RawParam): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function slug(v: RawParam): string | undefined {
  const value = first(v)?.trim();
  return value && value.length <= MAX_SLUG && SLUG.test(value) ? value : undefined;
}

export interface CatalogParams extends CatalogFilters {
  q?: string;
  sort: CatalogSort;
  page: number;
}

/**
 * Parameter URL katalog (`?q=&kategori=&fakultas=&prodi=&jenis=&tahun=&hki=1&urut=terbaru&page=`).
 * URL tidak dipercaya: nilai yang bentuknya salah dibuang diam-diam, bukan menyebabkan galat.
 */
export function parseCatalogParams(raw: RawParams): CatalogParams {
  const q = first(raw.q)?.trim().slice(0, 100) || undefined;

  const requestedPage = Number.parseInt(first(raw.page) ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1;

  const yearText = first(raw.tahun)?.trim();
  const yearNumber = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : undefined;
  const year = yearNumber && yearNumber >= 1900 && yearNumber <= 2100 ? yearNumber : undefined;

  // Dengan kata kunci, urutan bawaan adalah relevansi (perilaku sebelumnya); `urut=terbaru` mengubahnya.
  const sort: CatalogSort = q && first(raw.urut) !== "terbaru" ? "relevance" : "newest";

  return {
    q,
    category: slug(raw.kategori),
    faculty: slug(raw.fakultas),
    studyProgram: slug(raw.prodi),
    type: slug(raw.jenis),
    year,
    hasIp: first(raw.hki) === "1" ? true : undefined,
    sort,
    page,
  };
}

/** Jumlah penyaring aktif (tidak termasuk kata kunci, urutan, halaman). */
export function activeFilterCount(p: CatalogFilters): number {
  return [p.category, p.faculty, p.studyProgram, p.type, p.year, p.hasIp].filter((v) => v !== undefined).length;
}

/** Menyusun query string dari parameter, dengan perubahan opsional. Nilai kosong tidak dituliskan. */
export function catalogQueryString(p: CatalogParams, change: Partial<Record<keyof CatalogParams, unknown>> = {}): string {
  const merged = { ...p, ...change } as CatalogParams;
  const qs = new URLSearchParams();
  if (merged.q) qs.set("q", merged.q);
  if (merged.category) qs.set("kategori", merged.category);
  if (merged.faculty) qs.set("fakultas", merged.faculty);
  if (merged.studyProgram) qs.set("prodi", merged.studyProgram);
  if (merged.type) qs.set("jenis", merged.type);
  if (merged.year) qs.set("tahun", String(merged.year));
  if (merged.hasIp) qs.set("hki", "1");
  if (merged.q && merged.sort === "newest") qs.set("urut", "terbaru");
  if (merged.page > 1) qs.set("page", String(merged.page));
  return qs.toString();
}
