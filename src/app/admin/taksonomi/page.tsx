import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/catalog-ui";
import { toAuthUser } from "@/modules/auth/auth-user";
import { TAXONOMY_KINDS, type TaxonomyKind } from "@/modules/taxonomy/service";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getTaxonomyService } from "@/platform/auth/runtime";
import { TaxonomyManager } from "./taxonomy-manager";

export const metadata: Metadata = {
  title: "Data Acuan",
  robots: { index: false, follow: false },
};

const TABS: Record<TaxonomyKind, string> = {
  faculties: "Fakultas",
  "study-programs": "Program studi",
  categories: "Kategori",
  "innovation-types": "Jenis inovasi",
};

export default function TaxonomyPage({ searchParams }: PageProps<"/admin/taksonomi">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-balance text-3xl font-bold">Admin</h1>
        <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-card bg-border" aria-hidden="true" />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin/taksonomi">["searchParams"] }) {
  const raw = (await searchParams).jenis;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const kind: TaxonomyKind = (TAXONOMY_KINDS as readonly string[]).includes(requested ?? "")
    ? (requested as TaxonomyKind)
    : "categories";

  const session = await requireSession("/admin/taksonomi");
  if (!session.user.permissions.has("taxonomy.manage")) {
    return (
      <div className="mt-8">
        <EmptyState title="Akun ini tidak dapat mengelola data acuan">
          Hanya operator dan administrator yang dapat mengubah kategori, fakultas, program studi, dan jenis inovasi.
        </EmptyState>
      </div>
    );
  }

  const taxonomy = getTaxonomyService();
  const [list, faculties] = await Promise.all([
    taxonomy.list(toAuthUser(session.user), kind),
    taxonomy.list(toAuthUser(session.user), "faculties"),
  ]);
  if (!list.ok || !faculties.ok) {
    return (
      <div className="mt-8">
        <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman ini beberapa saat lagi.</EmptyState>
      </div>
    );
  }

  return (
    <>
      <p className="mt-6 max-w-prose text-muted-foreground">
        Daftar ini menjadi pilihan di formulir pengajuan dosen dan filter katalog. Isi dengan data resmi institusi.
      </p>
      <nav aria-label="Jenis data acuan" className="mt-4 flex flex-wrap gap-2">
        {TAXONOMY_KINDS.map((k) => (
          <Link
            key={k}
            href={`/admin/taksonomi?jenis=${k}`}
            aria-current={k === kind ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-control border px-4 text-sm font-semibold transition-colors ${
              k === kind ? "border-primary bg-primary-tint text-primary" : "border-border-input hover:bg-primary-tint"
            }`}
          >
            {TABS[k]}
          </Link>
        ))}
      </nav>
      <TaxonomyManager
        key={kind}
        kind={kind}
        items={list.data}
        faculties={faculties.data.map((f) => ({ id: f.id, name: f.name }))}
        csrf={csrfTokenFor(session)}
      />
    </>
  );
}
