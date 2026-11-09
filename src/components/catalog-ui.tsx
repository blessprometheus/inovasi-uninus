import { BadgeCheck, FlaskConical, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CatalogItem } from "@/modules/catalog/types";

/** Pengganti gambar sampul: pola netral, bukan foto stok (docs/UI_UX_GUIDELINES.md §8). */
export function CoverPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="flex aspect-[16/10] items-center justify-center rounded-t-card bg-primary-tint text-brand"
    >
      <FlaskConical className="size-10" strokeWidth={1.5} />
    </div>
  );
}

/** Sampul gambar bila ada; bila tidak, pola netral. Rasio tetap supaya kartu tidak melompat saat gambar dimuat. */
export function Cover({ url, alt, priority = false }: { url: string | null; alt: string | null; priority?: boolean }) {
  if (!url) return <CoverPlaceholder />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Berkas sudah di-re-encode dan dilayani rute sendiri; next/image tidak menambah nilai.
    <img
      src={url}
      alt={alt ?? ""}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className="aspect-[16/10] w-full rounded-t-card object-cover"
    />
  );
}

export function InnovationCard({ item }: { item: CatalogItem }) {
  const meta = [item.leadResearcherName, item.facultyName].filter(Boolean).join(" · ");
  return (
    <article className="group relative flex flex-col rounded-card border border-border bg-surface transition-shadow focus-within:shadow-md hover:shadow-md">
      <Cover url={item.coverUrl} alt={item.coverAlt} />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground">
          {item.categoryName ? <span>{item.categoryName}</span> : null}
          {item.year ? <span>{item.year}</span> : null}
          {item.hasIp ? (
            <span className="inline-flex items-center gap-1 rounded-control bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              HKI/Paten
            </span>
          ) : null}
        </p>
        <h3 className="text-balance text-xl font-semibold leading-snug">
          <Link
            href={`/inovasi/${item.slug}`}
            className="rounded-control after:absolute after:inset-0 after:content-['']"
          >
            {item.title}
          </Link>
        </h3>
        {meta ? <p className="text-sm font-medium text-muted-foreground">{meta}</p> : null}
        <p className="line-clamp-3 text-base text-foreground/90">{item.summary}</p>
      </div>
    </article>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border-input bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-tint text-brand">
        <Search className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children ? <p className="mt-2 max-w-prose text-muted-foreground">{children}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Formulir GET biasa: bekerja tanpa JavaScript dan mudah dibagikan lewat URL. */
export function SearchForm({
  defaultValue,
  size = "default",
  action = "/inovasi",
  label = "Cari inovasi",
}: {
  defaultValue?: string;
  size?: "default" | "large";
  action?: string;
  label?: string;
}) {
  return (
    <form action={action} method="get" role="search" className="flex w-full gap-2">
      <label htmlFor="q" className="sr-only">
        {label}
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        maxLength={100}
        placeholder={label}
        className={`min-w-0 flex-1 rounded-control border border-border-input bg-surface px-4 text-base placeholder:text-muted-foreground ${
          size === "large" ? "h-14" : "h-11"
        }`}
      />
      <button
        type="submit"
        className={`cursor-pointer rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover ${
          size === "large" ? "h-14" : "h-11"
        }`}
      >
        Cari
      </button>
    </form>
  );
}
