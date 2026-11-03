import Link from "next/link";
import type { ResearcherItem } from "@/modules/researchers/types";

/** Inisial dua huruf pertama dari nama, dipakai sebagai pengganti foto (foto menunggu OQ-02). */
export function initialsOf(fullName: string): string {
  const letters = fullName
    .replace(/\[[^\]]*\]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  return letters
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-tint font-bold text-primary ${
        size === "lg" ? "size-20 text-2xl" : "size-12 text-base"
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}

export function ResearcherCard({ item }: { item: ResearcherItem }) {
  const meta = [item.position, item.facultyName].filter(Boolean).join(" · ");
  return (
    <article className="group relative flex w-full gap-4 rounded-card border border-border bg-surface p-5 transition-shadow focus-within:shadow-md hover:shadow-md">
      <Avatar name={item.fullName} />
      <div className="min-w-0">
        <h3 className="text-balance text-lg font-semibold leading-snug">
          <Link
            href={`/peneliti/${item.slug}`}
            className="rounded-control after:absolute after:inset-0 after:content-['']"
          >
            {item.fullName}
          </Link>
        </h3>
        {meta ? <p className="mt-1 text-sm font-medium text-muted-foreground">{meta}</p> : null}
        <p className="mt-2 text-sm text-foreground/90">
          {item.innovationCount > 0 ? `${item.innovationCount} inovasi` : "Belum ada inovasi terpublikasi"}
        </p>
      </div>
    </article>
  );
}
