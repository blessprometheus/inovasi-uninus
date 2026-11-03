import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState, InnovationCard, SearchForm } from "@/components/catalog-ui";
import { getCatalogProvider } from "@/modules/catalog/providers";

async function loadHome() {
  "use cache";
  // Tag ini di-invalidate saat inovasi dipublikasikan/ditarik (docs/WORKFLOW.md §6).
  cacheTag("catalog");
  cacheLife("minutes");
  return getCatalogProvider().home();
}

export default function HomePage() {
  return (
    <main id="konten" className="flex-1">
      <section className="bg-surface">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <p className="mb-4 inline-block rounded-control bg-accent px-3 py-1 text-sm font-semibold text-on-accent">
            Universitas Islam Nusantara
          </p>
          <h1 className="max-w-3xl text-balance text-[2rem] font-extrabold leading-tight tracking-tight sm:text-5xl sm:leading-[1.1]">
            Inovasi dan Karya untuk Masa Depan
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Katalog hasil penelitian dan inovasi dosen UNINUS, terbuka bagi masyarakat, industri,
            dan pemerintah yang ingin berkolaborasi.
          </p>
          <div className="mt-8 max-w-2xl">
            <SearchForm size="large" />
          </div>
        </div>
      </section>

      {/* Data katalog dibaca saat request, bukan saat build: build tidak boleh bergantung pada database. */}
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </main>
  );
}

async function HomeContent() {
  await connection();
  const { featured, latest, stats } = await loadHome();
  const hasContent = featured.length > 0 || latest.length > 0;

  return (
    <>
      {stats ? (
        <section aria-label="Statistik" className="border-y border-border bg-primary-tint">
          <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:px-8">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Inovasi terpublikasi</dt>
              <dd className="text-3xl font-extrabold text-primary">{stats.innovations}</dd>
            </div>
            {stats.researchers > 0 ? (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Peneliti</dt>
                <dd className="text-3xl font-extrabold text-primary">{stats.researchers}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {hasContent ? (
        <>
          {featured.length > 0 ? (
            <CardSection title="Inovasi Unggulan" items={featured} />
          ) : null}
          {latest.length > 0 ? <CardSection title="Inovasi Terbaru" items={latest} /> : null}
        </>
      ) : (
        <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
          <EmptyState title="Katalog sedang disiapkan">
            Inovasi dan hasil penelitian dosen akan ditampilkan di sini setelah melalui proses
            verifikasi. Silakan kembali lagi nanti.
          </EmptyState>
        </section>
      )}
    </>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8" aria-hidden="true">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-card bg-border" />
        ))}
      </div>
    </div>
  );
}

function CardSection({
  title,
  items,
}: {
  title: string;
  items: Parameters<typeof InnovationCard>[0]["item"][];
}) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-2xl font-bold sm:text-[1.75rem]">{title}</h2>
        <Link href="/inovasi" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
          Lihat semua
        </Link>
      </div>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.slug} className="flex">
            <div className="flex w-full">
              <InnovationCard item={item} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
