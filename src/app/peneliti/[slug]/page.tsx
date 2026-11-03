import { ChevronRight, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InnovationCard } from "@/components/catalog-ui";
import { Avatar } from "@/components/researcher-ui";
import { getResearcherProvider } from "@/modules/researchers/providers";
import type { ResearcherDetail } from "@/modules/researchers/types";

/** Slug yang tidak valid tidak perlu sampai ke database. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function loadResearcher(slug: string): Promise<ResearcherDetail | null> {
  if (slug.length > 160 || !SLUG_PATTERN.test(slug)) return null;
  return getResearcherProvider().getBySlug(slug);
}

export async function generateMetadata({
  params,
}: PageProps<"/peneliti/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const item = await loadResearcher(slug);
  if (!item) return { title: "Peneliti tidak ditemukan" };
  return {
    title: item.fullName,
    description: [item.position, item.facultyName].filter(Boolean).join(" · ") || undefined,
    alternates: { canonical: `/peneliti/${item.slug}` },
  };
}

export default function ResearcherProfilePage({ params }: PageProps<"/peneliti/[slug]">) {
  return (
    <main id="konten" className="flex-1">
      {/* params adalah data runtime: dibaca di dalam Suspense (Cache Components). */}
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: Pick<PageProps<"/peneliti/[slug]">, "params">) {
  const { slug } = await params;
  const item = await loadResearcher(slug);
  if (!item) notFound();

  const meta = [item.position, item.facultyName, item.studyProgramName].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Navigasi remah roti" className="text-sm font-medium text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              Beranda
            </Link>
          </li>
          <ChevronRight className="size-4" aria-hidden="true" />
          <li>
            <Link href="/peneliti" className="hover:underline">
              Peneliti
            </Link>
          </li>
          <ChevronRight className="size-4" aria-hidden="true" />
          <li aria-current="page" className="text-foreground">
            {item.fullName}
          </li>
        </ol>
      </nav>

      <header className="mt-6 flex items-center gap-5">
        <Avatar name={item.fullName} size="lg" />
        <div>
          <h1 className="text-balance text-3xl font-bold leading-tight sm:text-4xl">
            {item.fullName}
          </h1>
          {meta.length > 0 ? (
            <p className="mt-2 text-base font-medium text-muted-foreground">{meta.join(" · ")}</p>
          ) : null}
        </div>
      </header>

      {item.bio ? (
        <section className="mt-8 max-w-prose">
          <h2 className="text-2xl font-bold">Profil</h2>
          <p className="mt-3 whitespace-pre-line text-lg leading-relaxed">{item.bio}</p>
        </section>
      ) : null}

      {item.externalLinks.length > 0 ? (
        <ul className="mt-6 flex flex-wrap gap-3">
          {item.externalLinks.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                rel="noopener noreferrer"
                target="_blank"
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-input px-4 font-semibold text-primary hover:bg-primary-tint"
              >
                {l.label}
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="sr-only">(membuka tab baru)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Inovasi</h2>
        {item.innovations.length > 0 ? (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {item.innovations.map((inv) => (
              <li key={inv.slug} className="flex">
                <div className="flex w-full">
                  <InnovationCard item={inv} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-muted-foreground">Belum ada inovasi yang dipublikasikan.</p>
        )}
      </section>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8" aria-hidden="true">
      <div className="h-5 w-64 animate-pulse rounded-control bg-border" />
      <div className="mt-6 flex items-center gap-5">
        <div className="size-20 animate-pulse rounded-full bg-border" />
        <div className="h-10 w-80 animate-pulse rounded-control bg-border" />
      </div>
    </div>
  );
}
