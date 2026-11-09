import { Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/catalog-ui";
import { StatusBadge } from "@/components/status-badge";
import { toAuthUser } from "@/modules/auth/auth-user";
import { INNOVATION_STATUSES, isOwnerEditable, type InnovationStatus } from "@/modules/workflow/transitions";
import { requireSession } from "@/platform/auth/current";
import { getInnovationService } from "@/platform/auth/runtime";
import { formatDate } from "@/platform/format/date";

export const metadata: Metadata = {
  title: "Dashboard Dosen",
  robots: { index: false, follow: false },
};

const PER_PAGE = 10;

export default function DosenDashboardPage({ searchParams }: PageProps<"/dosen">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

function parseParams(raw: { status?: string | string[]; page?: string | string[] }) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = first(raw.status);
  const requested = Number.parseInt(first(raw.page) ?? "1", 10);
  return {
    status: (INNOVATION_STATUSES as readonly string[]).includes(status ?? "") ? (status as InnovationStatus) : undefined,
    page: Number.isFinite(requested) && requested > 0 ? Math.min(requested, 10_000) : 1,
  };
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/dosen">["searchParams"] }) {
  const { status, page } = parseParams(await searchParams);
  const session = await requireSession("/dosen");
  const actor = toAuthUser(session.user);
  const service = getInnovationService();

  if (!actor.permissions.has("innovation.create")) {
    return (
      <EmptyState title="Akun ini tidak memiliki akses dosen">
        Dashboard ini untuk dosen dan peneliti. Hubungi operator bila Anda seharusnya memiliki akses.
      </EmptyState>
    );
  }

  const counts = await service.countsOwn(actor);
  const list = await service.listOwn(actor, { status, page, perPage: PER_PAGE });
  if (!counts.ok || !list.ok) {
    return (
      <EmptyState title="Data tidak dapat dimuat">
        Terjadi kendala saat memuat inovasi Anda. Muat ulang halaman ini beberapa saat lagi.
      </EmptyState>
    );
  }

  const c = counts.data;
  const n = (...keys: InnovationStatus[]) => keys.reduce((sum, k) => sum + (c[k] ?? 0), 0);
  const total = list.data.total;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Catatan revisi hanya dimuat untuk yang perlu tindakan (jumlahnya kecil).
  const revisions = list.data.items.filter((i) => i.status === "revision_required" && i.isOwner).slice(0, 5);
  const notes = await Promise.all(
    revisions.map(async (r) => {
      const detail = await service.getOwn(actor, r.id);
      return { ...r, note: detail.ok ? detail.data.revisionNote : null };
    }),
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-bold">Halo, {session.user.name}</h1>
          <p className="mt-1 text-muted-foreground">Kelola pengajuan inovasi dan penelitian Anda di sini.</p>
        </div>
        <Link
          href="/dosen/inovasi/baru"
          className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Plus className="size-5" aria-hidden="true" />
          Ajukan Inovasi
        </Link>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Draft" value={n("draft")} />
        <Tile label="Dalam proses" value={n("submitted", "under_review", "approved")} />
        <Tile label="Perlu revisi" value={n("revision_required")} />
        <Tile label="Terbit" value={n("published")} />
      </dl>

      {notes.length > 0 ? (
        <section aria-labelledby="tindakan" className="mt-10">
          <h2 id="tindakan" className="text-xl font-semibold">
            Perlu tindakan
          </h2>
          <ul className="mt-3 space-y-3">
            {notes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
                <div className="flex min-w-0 gap-3">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Revisi diminta{r.note ? `: ${r.note}` : "."}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/dosen/inovasi/${r.id}/edit`}
                  className="inline-flex min-h-11 items-center rounded-control border border-primary px-4 font-semibold text-primary hover:bg-primary-tint"
                >
                  Perbaiki
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="inovasi-saya" className="mt-10">
        <h2 id="inovasi-saya" className="text-xl font-semibold">
          Inovasi saya
        </h2>

        <nav aria-label="Saring menurut status" className="mt-3 flex flex-wrap gap-2">
          <FilterLink current={status} value={undefined}>
            Semua
          </FilterLink>
          {INNOVATION_STATUSES.filter((s) => (c[s] ?? 0) > 0 || s === status).map((s) => (
            <FilterLink key={s} current={status} value={s}>
              {STATUS_FILTER_LABEL[s]} ({c[s] ?? 0})
            </FilterLink>
          ))}
        </nav>

        {list.data.items.length === 0 ? (
          <div className="mt-4">
            {status ? (
              <EmptyState title="Tidak ada inovasi dengan status ini">
                Pilih status lain atau tampilkan semua inovasi.
              </EmptyState>
            ) : (
              <EmptyState
                title="Belum ada pengajuan"
                action={
                  <Link
                    href="/dosen/inovasi/baru"
                    className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover"
                  >
                    Ajukan inovasi pertama
                  </Link>
                }
              >
                Mulai dengan menyimpan draft. Anda dapat melengkapinya bertahap sebelum diajukan.
              </EmptyState>
            )}
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {list.data.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4">
                <div className="min-w-0 flex-1 basis-64">
                  <Link href={`/dosen/inovasi/${item.id}`} className="rounded-control font-semibold hover:text-primary hover:underline">
                    {item.title}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Diperbarui {formatDate(item.updatedAt)}
                    {item.isOwner ? "" : " · Anda anggota tim"}
                  </p>
                </div>
                <StatusBadge status={item.status} />
                {item.isOwner && isOwnerEditable(item.status) ? (
                  <Link
                    href={`/dosen/inovasi/${item.id}/edit`}
                    className="inline-flex min-h-11 items-center rounded-control border border-border-input px-4 font-semibold hover:bg-primary-tint"
                  >
                    Edit
                  </Link>
                ) : (
                  <Link
                    href={`/dosen/inovasi/${item.id}`}
                    className="inline-flex min-h-11 items-center rounded-control border border-border-input px-4 font-semibold hover:bg-primary-tint"
                  >
                    Lihat
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <nav aria-label="Halaman daftar" className="mt-6 flex items-center justify-center gap-4">
            {page > 1 ? <PageLink status={status} page={page - 1}>Sebelumnya</PageLink> : null}
            <span className="text-sm font-medium text-muted-foreground">
              Halaman {page} dari {totalPages}
            </span>
            {page < totalPages ? <PageLink status={status} page={page + 1}>Berikutnya</PageLink> : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}

const STATUS_FILTER_LABEL: Record<InnovationStatus, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  under_review: "Sedang diperiksa",
  revision_required: "Perlu revisi",
  approved: "Disetujui",
  published: "Terbit",
  unpublished: "Ditarik",
};

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-3xl font-bold">{value}</dd>
    </div>
  );
}

function FilterLink({
  current,
  value,
  children,
}: {
  current: InnovationStatus | undefined;
  value: InnovationStatus | undefined;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <Link
      href={value ? `/dosen?status=${value}` : "/dosen"}
      aria-current={active ? "true" : undefined}
      className={`inline-flex min-h-11 items-center rounded-control border px-4 text-sm font-semibold transition-colors ${
        active ? "border-primary bg-primary-tint text-primary" : "border-border-input hover:bg-primary-tint"
      }`}
    >
      {children}
    </Link>
  );
}

function PageLink({ status, page, children }: { status?: InnovationStatus; page: number; children: string }) {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  qs.set("page", String(page));
  return (
    <Link
      href={`/dosen?${qs.toString()}`}
      className="inline-flex min-h-11 items-center rounded-control border border-border-input px-5 font-semibold hover:bg-primary-tint"
    >
      {children}
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-10 w-72 animate-pulse rounded-control bg-border" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-border" />
        ))}
      </div>
      <div className="mt-10 h-64 animate-pulse rounded-card bg-border" />
    </div>
  );
}
