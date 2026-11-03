import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, InnovationCard, SearchForm } from "@/components/catalog-ui";
import { getCatalogProvider } from "@/modules/catalog/providers";
import { parseListParams } from "@/platform/http/list-params";

export const metadata: Metadata = {
  title: "Katalog Inovasi",
  description: "Jelajahi hasil penelitian dan inovasi dosen Universitas Islam Nusantara.",
};

const PER_PAGE = 12;

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
  const { q, page } = parseListParams(await searchParams);

  const { items, total } = await getCatalogProvider().search({ q, page, perPage: PER_PAGE });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <>
      <div className="mt-6 max-w-2xl">
        <SearchForm defaultValue={q} />
      </div>

      <p className="mt-6 text-sm font-medium text-muted-foreground" aria-live="polite">
        {total > 0 ? `${total} inovasi ditemukan${q ? ` untuk "${q}"` : ""}` : null}
      </p>

      {items.length === 0 ? (
        <div className="mt-4">
          {q ? (
            <EmptyState
              title="Tidak ada hasil"
              action={
                <Link
                  href="/inovasi"
                  className="inline-flex min-h-11 items-center rounded-control border border-border-input px-5 font-semibold hover:bg-primary-tint"
                >
                  Reset pencarian
                </Link>
              }
            >
              Tidak ada inovasi yang cocok dengan &ldquo;{q}&rdquo;. Coba kata kunci yang lebih umum
              atau periksa ejaan.
            </EmptyState>
          ) : (
            <EmptyState title="Katalog sedang disiapkan">
              Belum ada inovasi yang dipublikasikan. Silakan kembali lagi nanti.
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
              {page > 1 ? (
                <PageLink q={q} page={page - 1}>
                  Sebelumnya
                </PageLink>
              ) : null}
              <span className="text-sm font-medium text-muted-foreground">
                Halaman {page} dari {totalPages}
              </span>
              {page < totalPages ? (
                <PageLink q={q} page={page + 1}>
                  Berikutnya
                </PageLink>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

function PageLink({ q, page, children }: { q?: string; page: number; children: string }) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  qs.set("page", String(page));
  return (
    <Link
      href={`/inovasi?${qs.toString()}`}
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
