import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/catalog-ui";
import { StatusBadge } from "@/components/status-badge";
import { toAuthUser } from "@/modules/auth/auth-user";
import { INNOVATION_STATUSES, type InnovationStatus } from "@/modules/workflow/transitions";
import { requireSession } from "@/platform/auth/current";
import { getAdminInnovationService, getTaxonomyService } from "@/platform/auth/runtime";
import { formatDate } from "@/platform/format/date";

export const metadata: Metadata = {
  title: "Kelola Inovasi",
  robots: { index: false, follow: false },
};

const PER_PAGE = 20;

export default function AdminPage({ searchParams }: PageProps<"/admin/inovasi">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-balance text-3xl font-bold">Inovasi</h1>
          <Link
            href="/admin/inovasi/baru"
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Plus className="size-5" aria-hidden="true" />
            Tambah inovasi
          </Link>
        </div>
        <Suspense fallback={<Skeleton />}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseParams(raw: Record<string, string | string[] | undefined>) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = first(raw.status);
  const faculty = first(raw.fakultas);
  const requested = Number.parseInt(first(raw.page) ?? "1", 10);
  return {
    status: (INNOVATION_STATUSES as readonly string[]).includes(status ?? "") ? (status as InnovationStatus) : undefined,
    facultyId: faculty && UUID.test(faculty) ? faculty : undefined,
    q: first(raw.q)?.trim().slice(0, 100) || undefined,
    page: Number.isFinite(requested) && requested > 0 ? Math.min(requested, 10_000) : 1,
  };
}

/** Hanya status alur operator yang ditawarkan (ADR-008). Status lama tetap dikenali di URL. */
const FILTER_STATUSES = ["draft", "published", "unpublished"] as const satisfies readonly InnovationStatus[];

const FILTER_LABEL: Record<InnovationStatus, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  under_review: "Sedang diperiksa",
  revision_required: "Perlu revisi",
  approved: "Disetujui",
  published: "Terbit",
  unpublished: "Ditarik",
};

async function Queue({ searchParams }: { searchParams: PageProps<"/admin/inovasi">["searchParams"] }) {
  const params = parseParams(await searchParams);
  const session = await requireSession("/admin/inovasi");
  const actor = toAuthUser(session.user);

  if (!actor.permissions.has("innovation.read_any")) {
    return (
      <div className="mt-8">
        <EmptyState title="Akun ini tidak memiliki akses admin">
          Halaman ini untuk operator dan administrator.
        </EmptyState>
      </div>
    );
  }

  const admin = getAdminInnovationService();
  const [counts, list, faculties] = await Promise.all([
    admin.counts(actor),
    admin.list(actor, { ...params, perPage: PER_PAGE }),
    getTaxonomyService().listPublic("faculties"),
  ]);
  if (!counts.ok || !list.ok) {
    return (
      <div className="mt-8">
        <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman ini beberapa saat lagi.</EmptyState>
      </div>
    );
  }

  const c = counts.data;
  const { items, total } = list.data;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const filtered = Boolean(params.status || params.facultyId || params.q);

  return (
    <>
      <dl className="mt-8 grid grid-cols-3 gap-4">
        <Tile label="Draft" value={c.draft ?? 0} href="/admin/inovasi?status=draft" highlight />
        <Tile label="Terbit" value={c.published ?? 0} href="/admin/inovasi?status=published" />
        <Tile label="Ditarik" value={c.unpublished ?? 0} href="/admin/inovasi?status=unpublished" />
      </dl>

      <section aria-labelledby="antrean" className="mt-10">
        <h2 id="antrean" className="text-xl font-semibold">
          Semua inovasi
        </h2>

        <form action="/admin/inovasi" method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="q" className="block text-sm font-semibold">
              Cari judul
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={params.q}
              maxLength={100}
              className="mt-1 h-11 w-full rounded-control border border-border-input bg-surface px-4"
            />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-semibold">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={params.status ?? ""}
              className="mt-1 h-11 rounded-control border border-border-input bg-surface px-3"
            >
              <option value="">Semua status</option>
              {FILTER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FILTER_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fakultas" className="block text-sm font-semibold">
              Fakultas
            </label>
            <select
              id="fakultas"
              name="fakultas"
              defaultValue={params.facultyId ?? ""}
              className="mt-1 h-11 max-w-60 rounded-control border border-border-input bg-surface px-3"
            >
              <option value="">Semua fakultas</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-11 cursor-pointer rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Terapkan
          </button>
          {filtered ? (
            <Link href="/admin/inovasi" className="inline-flex h-11 items-center rounded-control px-3 font-semibold text-primary hover:underline">
              Reset
            </Link>
          ) : null}
        </form>

        <p className="mt-4 text-sm font-medium text-muted-foreground" aria-live="polite">
          {total} inovasi{filtered ? " sesuai filter" : ""}
        </p>

        {items.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={filtered ? "Tidak ada inovasi yang cocok" : "Belum ada inovasi"}>
              {filtered
                ? "Ubah atau reset filter untuk melihat inovasi lain."
                : "Mulai dengan menambahkan inovasi dari berkas yang diserahkan dosen."}
            </EmptyState>
          </div>
        ) : (
          <>
            {/* Layar lebar: tabel semantik. Layar sempit: kartu (UI_UX_GUIDELINES §5). */}
            <div className="mt-3 hidden overflow-hidden rounded-card border border-border bg-surface md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Daftar inovasi</caption>
                <thead className="bg-background text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Judul</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Diinput oleh</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Fakultas</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Diperbarui</th>
                    <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <th scope="row" className="max-w-sm px-4 py-3 font-semibold">
                        <Link href={`/admin/inovasi/${item.id}`} className="hover:text-primary hover:underline">
                          {item.title}
                        </Link>
                      </th>
                      <td className="px-4 py-3">{item.submitterName}</td>
                      <td className="px-4 py-3">{item.facultyName ?? "-"}</td>
                      <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(item.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/inovasi/${item.id}`}
                          className="inline-flex min-h-11 items-center rounded-control border border-primary px-4 font-semibold text-primary hover:bg-primary-tint"
                        >
                          Kelola<span className="sr-only">: {item.title}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-3 space-y-3 md:hidden">
              {items.map((item) => (
                <li key={item.id} className="rounded-card border border-border bg-surface p-4">
                  <Link href={`/admin/inovasi/${item.id}`} className="font-semibold hover:text-primary hover:underline">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.submitterName}
                    {item.facultyName ? ` · ${item.facultyName}` : ""} · {formatDate(item.updatedAt)}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={item.status} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {totalPages > 1 ? (
          <nav aria-label="Halaman daftar" className="mt-6 flex items-center justify-center gap-4">
            {params.page > 1 ? <PageLink params={params} page={params.page - 1}>Sebelumnya</PageLink> : null}
            <span className="text-sm font-medium text-muted-foreground">
              Halaman {params.page} dari {totalPages}
            </span>
            {params.page < totalPages ? <PageLink params={params} page={params.page + 1}>Berikutnya</PageLink> : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}

function Tile({ label, value, href, highlight }: { label: string; value: number; href: string; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={`block rounded-card border p-4 transition-shadow hover:shadow-md ${
        highlight && value > 0 ? "border-accent bg-surface ring-2 ring-accent" : "border-border bg-surface"
      }`}
    >
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-3xl font-bold">{value}</dd>
    </Link>
  );
}

function PageLink({
  params,
  page,
  children,
}: {
  params: ReturnType<typeof parseParams>;
  page: number;
  children: string;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  if (params.facultyId) qs.set("fakultas", params.facultyId);
  qs.set("page", String(page));
  return (
    <Link
      href={`/admin/inovasi?${qs.toString()}`}
      className="inline-flex min-h-11 items-center rounded-control border border-border-input px-5 font-semibold hover:bg-primary-tint"
    >
      {children}
    </Link>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="mt-8">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-border" />
        ))}
      </div>
      <div className="mt-10 h-64 animate-pulse rounded-card bg-border" />
    </div>
  );
}
