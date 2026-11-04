import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, InnovationCard } from "@/components/catalog-ui";
import { getCatalogProvider } from "@/modules/catalog/providers";
import { pageMetadata } from "@/modules/seo/metadata";
import type { CatalogFacets } from "@/modules/catalog/types";
import {
  activeFilterCount,
  catalogQueryString,
  parseCatalogParams,
  type CatalogParams,
} from "@/platform/http/catalog-params";

const PER_PAGE = 12;

/**
 * Halaman tanpa kata kunci/penyaring/halaman lanjutan adalah satu-satunya yang diindeks. Variasi lainnya
 * `noindex,follow` dengan canonical ke /inovasi supaya mesin pencari tidak menimbun URL turunan.
 */
export async function generateMetadata({ searchParams }: PageProps<"/inovasi">): Promise<Metadata> {
  const p = parseCatalogParams(await searchParams);
  const isVariant = Boolean(p.q) || activeFilterCount(p) > 0 || p.page > 1;
  return {
    ...pageMetadata({
      title: "Katalog Inovasi",
      description: "Jelajahi hasil penelitian dan inovasi dosen Universitas Islam Nusantara.",
      path: "/inovasi",
    }),
    ...(isVariant ? { robots: { index: false, follow: true } } : {}),
  };
}

export default function CatalogPage({ searchParams }: PageProps<"/inovasi">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-balance text-3xl font-bold sm:text-4xl">Katalog Inovasi</h1>
        {/* searchParams adalah data runtime: harus dibaca di dalam batas Suspense (Cache Components). */}
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/inovasi">["searchParams"] }) {
  const params = parseCatalogParams(await searchParams);
  const provider = getCatalogProvider();

  const [{ items, total }, facets] = await Promise.all([
    provider.search({ ...params, perPage: PER_PAGE }),
    provider.facets(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const filterCount = activeFilterCount(params);
  const isFiltered = Boolean(params.q) || filterCount > 0;
  const hasFacets =
    facets.categories.length + facets.faculties.length + facets.studyPrograms.length + facets.types.length + facets.years.length > 0;

  // Katalog yang benar-benar kosong: tidak ada yang bisa disaring, jadi tampilkan penjelasan saja.
  if (!isFiltered && total === 0 && !hasFacets) {
    return (
      <div className="mt-6">
        <EmptyState title="Katalog sedang disiapkan">
          Belum ada inovasi yang dipublikasikan. Silakan kembali lagi nanti.
        </EmptyState>
      </div>
    );
  }

  return (
    <form action="/inovasi" method="get" className="mt-6">
      <div role="search" className="flex max-w-2xl gap-2">
        <label htmlFor="q" className="sr-only">
          Cari inovasi
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={params.q}
          maxLength={100}
          placeholder="Cari inovasi"
          className="h-11 min-w-0 flex-1 rounded-control border border-border-input bg-surface px-4 text-base placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          className="h-11 cursor-pointer rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Cari
        </button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        {hasFacets ? <FilterPanel params={params} facets={facets} count={filterCount} /> : null}

        <section aria-label="Hasil pencarian" className={hasFacets ? "min-w-0" : "min-w-0 lg:col-span-2"}>
          <ActiveFilters params={params} facets={facets} />

          <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
            {total > 0 ? `${total} inovasi ditemukan${params.q ? ` untuk "${params.q}"` : ""}` : null}
          </p>

          {items.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Tidak ada hasil"
                action={
                  <Link
                    href="/inovasi"
                    className="inline-flex min-h-11 items-center rounded-control border border-border-input px-5 font-semibold hover:bg-primary-tint"
                  >
                    Reset pencarian dan filter
                  </Link>
                }
              >
                Tidak ada inovasi yang cocok dengan pencarian atau filter ini. Coba kata kunci yang lebih umum, periksa
                ejaan, atau kurangi filter.
              </EmptyState>
            </div>
          ) : (
            <>
              <ul className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <li key={item.slug} className="flex">
                    <div className="flex w-full">
                      <InnovationCard item={item} />
                    </div>
                  </li>
                ))}
              </ul>
              {totalPages > 1 ? (
                <nav aria-label="Halaman hasil" className="mt-10 flex items-center justify-center gap-4">
                  {params.page > 1 ? <PageLink params={params} page={params.page - 1}>Sebelumnya</PageLink> : null}
                  <span className="text-sm font-medium text-muted-foreground">
                    Halaman {params.page} dari {totalPages}
                  </span>
                  {params.page < totalPages ? <PageLink params={params} page={params.page + 1}>Berikutnya</PageLink> : null}
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
    </form>
  );
}

const SELECT = "mt-1 h-11 w-full rounded-control border border-border-input bg-surface px-3 text-base";

/**
 * Panel filter di dalam formulir GET yang sama dengan kotak cari, jadi tanpa JavaScript pun berfungsi.
 * Di layar kecil dibuka-tutup dengan kotak centang tersembunyi (peer); di layar lebar selalu tampil.
 */
function FilterPanel({ params, facets, count }: { params: CatalogParams; facets: CatalogFacets; count: number }) {
  // Program studi dikelompokkan per fakultas supaya nama yang mirip tidak membingungkan.
  const programsByFaculty = new Map<string, CatalogFacets["studyPrograms"]>();
  for (const sp of facets.studyPrograms) {
    const key = sp.facultyName ?? "Lainnya";
    programsByFaculty.set(key, [...(programsByFaculty.get(key) ?? []), sp]);
  }

  return (
    <aside aria-label="Filter katalog" className="min-w-0">
      <input type="checkbox" id="buka-filter" defaultChecked={count > 0} className="peer sr-only" />
      <label
        htmlFor="buka-filter"
        className="flex min-h-11 cursor-pointer items-center justify-between rounded-control border border-border-input bg-surface px-4 font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring lg:hidden"
      >
        <span>Filter{count > 0 ? ` (${count})` : ""}</span>
        <span aria-hidden="true" className="text-sm text-muted-foreground">
          Buka / tutup
        </span>
      </label>

      <div className="mt-3 hidden space-y-4 rounded-card border border-border bg-surface p-4 peer-checked:block lg:mt-0 lg:block">
        {facets.categories.length > 0 ? (
          <div>
            <label htmlFor="f-kategori" className="block text-sm font-semibold">Kategori</label>
            <select id="f-kategori" name="kategori" defaultValue={params.category ?? ""} className={SELECT}>
              <option value="">Semua kategori</option>
              {facets.categories.map((o) => (
                <option key={o.slug} value={o.slug}>{o.name} ({o.count})</option>
              ))}
            </select>
          </div>
        ) : null}

        {facets.faculties.length > 0 ? (
          <div>
            <label htmlFor="f-fakultas" className="block text-sm font-semibold">Fakultas</label>
            <select id="f-fakultas" name="fakultas" defaultValue={params.faculty ?? ""} className={SELECT}>
              <option value="">Semua fakultas</option>
              {facets.faculties.map((o) => (
                <option key={o.slug} value={o.slug}>{o.name} ({o.count})</option>
              ))}
            </select>
          </div>
        ) : null}

        {facets.studyPrograms.length > 0 ? (
          <div>
            <label htmlFor="f-prodi" className="block text-sm font-semibold">Program studi</label>
            <select id="f-prodi" name="prodi" defaultValue={params.studyProgram ?? ""} className={SELECT}>
              <option value="">Semua program studi</option>
              {[...programsByFaculty].map(([faculty, list]) => (
                <optgroup key={faculty} label={faculty}>
                  {list.map((o) => (
                    <option key={o.slug} value={o.slug}>{o.name} ({o.count})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : null}

        {facets.years.length > 0 ? (
          <div>
            <label htmlFor="f-tahun" className="block text-sm font-semibold">Tahun</label>
            <select id="f-tahun" name="tahun" defaultValue={params.year?.toString() ?? ""} className={SELECT}>
              <option value="">Semua tahun</option>
              {facets.years.map((o) => (
                <option key={o.year} value={o.year}>{o.year} ({o.count})</option>
              ))}
            </select>
          </div>
        ) : null}

        {facets.types.length > 0 ? (
          <div>
            <label htmlFor="f-jenis" className="block text-sm font-semibold">Jenis inovasi</label>
            <select id="f-jenis" name="jenis" defaultValue={params.type ?? ""} className={SELECT}>
              <option value="">Semua jenis</option>
              {facets.types.map((o) => (
                <option key={o.slug} value={o.slug}>{o.name} ({o.count})</option>
              ))}
            </select>
          </div>
        ) : null}

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border-input px-3">
          <input type="checkbox" name="hki" value="1" defaultChecked={params.hasIp} className="size-5 accent-[var(--color-primary)]" />
          <span>Memiliki HKI / paten</span>
        </label>

        {params.q ? (
          <div>
            <label htmlFor="f-urut" className="block text-sm font-semibold">Urutkan</label>
            <select id="f-urut" name="urut" defaultValue={params.sort === "newest" ? "terbaru" : ""} className={SELECT}>
              <option value="">Paling relevan</option>
              <option value="terbaru">Terbaru</option>
            </select>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="submit"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-control bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Terapkan filter
          </button>
          {count > 0 || params.q ? (
            <Link
              href="/inovasi"
              className="inline-flex min-h-11 items-center rounded-control px-3 font-semibold text-primary hover:underline"
            >
              Reset
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function ActiveFilters({ params, facets }: { params: CatalogParams; facets: CatalogFacets }) {
  const nameOf = (list: { slug: string; name: string }[], slug: string) => list.find((o) => o.slug === slug)?.name ?? slug;
  const chips: { label: string; remove: Partial<Record<keyof CatalogParams, unknown>> }[] = [];
  if (params.category) chips.push({ label: `Kategori: ${nameOf(facets.categories, params.category)}`, remove: { category: undefined } });
  if (params.faculty) chips.push({ label: `Fakultas: ${nameOf(facets.faculties, params.faculty)}`, remove: { faculty: undefined } });
  if (params.studyProgram) chips.push({ label: `Prodi: ${nameOf(facets.studyPrograms, params.studyProgram)}`, remove: { studyProgram: undefined } });
  if (params.type) chips.push({ label: `Jenis: ${nameOf(facets.types, params.type)}`, remove: { type: undefined } });
  if (params.year) chips.push({ label: `Tahun: ${params.year}`, remove: { year: undefined } });
  if (params.hasIp) chips.push({ label: "Memiliki HKI / paten", remove: { hasIp: undefined } });
  if (chips.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Filter aktif" role="group">
      {chips.map((chip) => {
        const qs = catalogQueryString(params, { ...chip.remove, page: 1 });
        return (
          <Link
            key={chip.label}
            href={qs ? `/inovasi?${qs}` : "/inovasi"}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-input bg-primary-tint px-3 text-sm font-semibold hover:bg-surface"
          >
            {chip.label}
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Hapus filter</span>
          </Link>
        );
      })}
      <Link href="/inovasi" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary hover:underline">
        Reset semua
      </Link>
    </div>
  );
}

function PageLink({ params, page, children }: { params: CatalogParams; page: number; children: string }) {
  const qs = catalogQueryString(params, { page });
  return (
    <Link
      href={`/inovasi?${qs}`}
      className="inline-flex min-h-11 items-center rounded-control border border-border-input px-5 font-semibold hover:bg-primary-tint"
    >
      {children}
    </Link>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-6" aria-hidden="true">
      <div className="h-11 max-w-2xl animate-pulse rounded-control bg-border" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-card bg-border" />
        ))}
      </div>
    </div>
  );
}
