import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/catalog-ui";
import { toAuthUser } from "@/modules/auth/auth-user";
import { requireSession } from "@/platform/auth/current";
import { getAdminResearcherService } from "@/platform/auth/runtime";

export const metadata: Metadata = {
  title: "Kelola Peneliti",
  robots: { index: false, follow: false },
};

const PER_PAGE = 20;

export default function ResearchersPage({ searchParams }: PageProps<"/admin/peneliti">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-balance text-3xl font-bold">Peneliti</h1>
          <Link
            href="/admin/peneliti/baru"
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Plus className="size-5" aria-hidden="true" />
            Tambah peneliti
          </Link>
        </div>
        <Suspense fallback={<div aria-hidden="true" className="mt-8 h-64 animate-pulse rounded-card bg-border" />}>
          <ResearcherList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function ResearcherList({ searchParams }: { searchParams: PageProps<"/admin/peneliti">["searchParams"] }) {
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = first(raw.q)?.trim().slice(0, 100) || undefined;
  const requested = Number.parseInt(first(raw.page) ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 10_000) : 1;

  const session = await requireSession("/admin/peneliti");
  const actor = toAuthUser(session.user);
  if (!actor.permissions.has("researcher.manage")) {
    return (
      <div className="mt-8">
        <EmptyState title="Akun ini tidak memiliki akses admin">Halaman ini untuk operator dan administrator.</EmptyState>
      </div>
    );
  }

  const result = await getAdminResearcherService().list(actor, { q, page, perPage: PER_PAGE });
  if (!result.ok) {
    return (
      <div className="mt-8">
        <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman ini beberapa saat lagi.</EmptyState>
      </div>
    );
  }
  const { items, total } = result.data;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    qs.set("page", String(n));
    return `/admin/peneliti?${qs.toString()}`;
  };

  return (
    <section aria-labelledby="daftar" className="mt-8">
      <h2 id="daftar" className="sr-only">
        Daftar peneliti
      </h2>
      <form action="/admin/peneliti" method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="q" className="block text-sm font-semibold">
            Cari nama
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            className="mt-1 h-11 w-full rounded-control border border-border-input bg-surface px-4"
          />
        </div>
        <button
          type="submit"
          className="h-11 cursor-pointer rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Cari
        </button>
        {q ? (
          <Link href="/admin/peneliti" className="inline-flex h-11 items-center rounded-control px-3 font-semibold text-primary hover:underline">
            Reset
          </Link>
        ) : null}
      </form>

      <p className="mt-4 text-sm font-medium text-muted-foreground" aria-live="polite">
        {total} peneliti{q ? " sesuai pencarian" : ""}
      </p>

      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={q ? "Tidak ada peneliti yang cocok" : "Belum ada peneliti"}>
            {q
              ? "Ubah kata kunci atau reset pencarian."
              : "Tambahkan peneliti dulu, lalu pilih sebagai ketua atau anggota saat menginput inovasi."}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Daftar peneliti</caption>
            <thead className="bg-background text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Nama</th>
                <th scope="col" className="px-4 py-3 font-semibold">Jabatan</th>
                <th scope="col" className="px-4 py-3 font-semibold">Fakultas</th>
                <th scope="col" className="px-4 py-3 font-semibold">Inovasi</th>
                <th scope="col" className="px-4 py-3 font-semibold">Profil publik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="px-4 py-3 font-semibold">
                    <Link href={`/admin/peneliti/${r.id}`} className="hover:text-primary hover:underline">
                      {r.fullName}
                    </Link>
                  </th>
                  <td className="px-4 py-3">{r.position ?? "-"}</td>
                  <td className="px-4 py-3">{r.facultyName ?? "-"}</td>
                  <td className="px-4 py-3">{r.innovationCount}</td>
                  <td className="px-4 py-3">{r.isPublic ? "Tampil" : "Disembunyikan"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Halaman daftar" className="mt-6 flex items-center justify-center gap-4">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center rounded-control border border-border-input px-5 font-semibold hover:bg-primary-tint">
              Sebelumnya
            </Link>
          ) : null}
          <span className="text-sm font-medium text-muted-foreground">
            Halaman {page} dari {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center rounded-control border border-border-input px-5 font-semibold hover:bg-primary-tint">
              Berikutnya
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
