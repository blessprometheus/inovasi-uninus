import { BadgeCheck, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, innovationJsonLd } from "@/modules/seo/json-ld";
import { pageMetadata } from "@/modules/seo/metadata";
import { getSiteUrl } from "@/platform/config/site";
import { CoverPlaceholder } from "@/components/catalog-ui";
import { getCatalogProvider } from "@/modules/catalog/providers";
import type { CatalogDetail } from "@/modules/catalog/types";

/** Slug yang tidak valid tidak perlu sampai ke database. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function loadInnovation(slug: string): Promise<CatalogDetail | null> {
  if (slug.length > 160 || !SLUG_PATTERN.test(slug)) return null;
  return getCatalogProvider().getBySlug(slug);
}

export async function generateMetadata({ params }: PageProps<"/inovasi/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const item = await loadInnovation(slug);
  if (!item) return { title: "Inovasi tidak ditemukan" };
  return pageMetadata({
    title: item.title,
    description: item.summary,
    path: `/inovasi/${item.slug}`,
    type: "article",
    publishedTime: item.publishedAt,
    authors: item.members.map((m) => m.name),
  });
}

export default function InnovationDetailPage({ params }: PageProps<"/inovasi/[slug]">) {
  return (
    <main id="konten" className="flex-1">
      {/* params adalah data runtime: dibaca di dalam Suspense (Cache Components). */}
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: Pick<PageProps<"/inovasi/[slug]">, "params">) {
  const { slug } = await params;
  const item = await loadInnovation(slug);
  if (!item) notFound();

  const lead = item.members.find((m) => m.role === "lead");
  const subtitle = [
    lead ? `Ketua: ${lead.name}` : null,
    item.facultyName,
    item.studyProgramName,
    item.year ? `Tahun ${item.year}` : null,
  ].filter(Boolean);

  const sections: { heading: string; body: string | null }[] = [
    { heading: "Abstrak", body: item.abstract },
    { heading: "Latar Belakang", body: item.background },
    { heading: "Permasalahan", body: item.problemStatement },
    { heading: "Tujuan", body: item.objective },
    { heading: "Metodologi", body: item.methodology },
    { heading: "Deskripsi Inovasi", body: item.description },
    { heading: "Keunggulan", body: item.advantages },
    { heading: "Manfaat", body: item.benefits },
    { heading: "Potensi Pengembangan", body: item.developmentPotential },
  ];

  const baseUrl = getSiteUrl();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={innovationJsonLd(item, baseUrl)} />
      <JsonLd
        data={breadcrumbJsonLd(baseUrl, [
          { name: "Beranda", path: "/" },
          { name: "Inovasi", path: "/inovasi" },
          { name: item.title, path: `/inovasi/${item.slug}` },
        ])}
      />
      <nav aria-label="Navigasi remah roti" className="text-sm font-medium text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              Beranda
            </Link>
          </li>
          <ChevronRight className="size-4" aria-hidden="true" />
          <li>
            <Link href="/inovasi" className="hover:underline">
              Inovasi
            </Link>
          </li>
          <ChevronRight className="size-4" aria-hidden="true" />
          <li aria-current="page" className="line-clamp-1 text-foreground">
            {item.title}
          </li>
        </ol>
      </nav>

      <header className="mt-6 max-w-3xl">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {item.categoryName ? (
            <span className="rounded-control bg-primary-tint px-2.5 py-1 text-primary">
              {item.categoryName}
            </span>
          ) : null}
          {item.typeName ? (
            <span className="rounded-control bg-primary-tint px-2.5 py-1 text-primary">
              {item.typeName}
            </span>
          ) : null}
          {item.hasIp ? (
            <span className="inline-flex items-center gap-1 rounded-control bg-accent px-2.5 py-1 text-on-accent">
              <BadgeCheck className="size-4" aria-hidden="true" />
              HKI/Paten
            </span>
          ) : null}
        </p>
        <h1 className="mt-3 text-balance text-3xl font-bold leading-tight sm:text-4xl">
          {item.title}
        </h1>
        {subtitle.length > 0 ? (
          <p className="mt-3 text-base font-medium text-muted-foreground">{subtitle.join(" · ")}</p>
        ) : null}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0">
          <div className="overflow-hidden rounded-card border border-border">
            <CoverPlaceholder />
          </div>
          <p className="mt-6 text-lg text-foreground/90">{item.summary}</p>
          {sections
            .filter((s) => s.body)
            .map((s) => (
              <section key={s.heading} className="mt-8">
                <h2 className="text-2xl font-bold">{s.heading}</h2>
                <PlainText text={s.body as string} />
              </section>
            ))}
        </article>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          {item.members.length > 0 ? (
            <SidePanel title="Tim Peneliti">
              <ul className="flex flex-col gap-2">
                {item.members.map((m) => (
                  <li key={`${m.role}-${m.name}`}>
                    <span className="block text-sm font-medium text-muted-foreground">
                      {m.role === "lead" ? "Ketua" : "Anggota"}
                    </span>
                    {m.name}
                  </li>
                ))}
              </ul>
            </SidePanel>
          ) : null}

          {item.intellectualProperties.length > 0 ? (
            <SidePanel title="Legalitas">
              <ul className="flex flex-col gap-3">
                {item.intellectualProperties.map((ip, i) => (
                  <li key={`${ip.kind}-${i}`}>
                    <span className="block font-semibold">{ip.kind}</span>
                    {[ip.status, ip.registrationNumber, ip.year].filter(Boolean).join(" · ")}
                  </li>
                ))}
              </ul>
            </SidePanel>
          ) : null}

          {item.publications.length > 0 ? (
            <SidePanel title="Publikasi">
              <ul className="flex flex-col gap-3">
                {item.publications.map((p, i) => (
                  <li key={`${p.title}-${i}`}>
                    {p.url ? (
                      <a
                        href={p.url}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {p.title}
                      </a>
                    ) : (
                      <span className="font-semibold">{p.title}</span>
                    )}
                    <span className="block text-sm text-muted-foreground">
                      {[p.venue, p.year, p.doi ? `DOI: ${p.doi}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </SidePanel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Teks panjang adalah plain text (ADR-006): dipecah per paragraf, tidak pernah dirender sebagai HTML. */
function PlainText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="mt-3 flex max-w-prose flex-col gap-4 text-lg leading-relaxed">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8" aria-hidden="true">
      <div className="h-5 w-64 animate-pulse rounded-control bg-border" />
      <div className="mt-6 h-10 max-w-3xl animate-pulse rounded-control bg-border" />
      <div className="mt-8 h-72 animate-pulse rounded-card bg-border" />
    </div>
  );
}
