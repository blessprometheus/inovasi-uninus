import { CheckCircle2, Circle, EyeOff, FilePenLine, GraduationCap, Globe, Lightbulb, Plus, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/catalog-ui";
import { StatusBadge } from "@/components/status-badge";
import { toAuthUser } from "@/modules/auth/auth-user";
import { requireSession } from "@/platform/auth/current";
import { getAdminInnovationService, getAdminResearcherService, getTaxonomyService } from "@/platform/auth/runtime";
import { formatDate } from "@/platform/format/date";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<Skeleton />}>
          <Dashboard />
        </Suspense>
      </div>
    </main>
  );
}

/** Sapaan menurut jam di zona waktu WIB. */
function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(now));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Nama depan untuk sapaan; awalan penanda data uji "[DUMMY]" dibuang. */
function firstName(full: string): string {
  const cleaned = full.replace(/^\[[^\]]*\]\s*/, "").trim();
  return cleaned.split(/\s+/)[0] || full;
}

async function Dashboard() {
  const session = await requireSession("/admin");
  const actor = toAuthUser(session.user);

  if (!actor.permissions.has("innovation.read_any")) {
    return (
      <EmptyState title="Akun ini tidak memiliki akses admin">Halaman ini untuk operator dan administrator.</EmptyState>
    );
  }

  const admin = getAdminInnovationService();
  const taxonomy = getTaxonomyService();
  // Berurutan: satu koneksi per layanan, dan datanya kecil.
  const counts = await admin.counts(actor);
  const drafts = await admin.list(actor, { status: "draft", page: 1, perPage: 5 });
  const recent = await admin.list(actor, { page: 1, perPage: 5 });
  const researchers = await getAdminResearcherService().list(actor, { page: 1, perPage: 1 });
  const categories = await taxonomy.listPublic("categories");
  const faculties = await taxonomy.listPublic("faculties");

  if (!counts.ok || !drafts.ok || !recent.ok || !researchers.ok) {
    return <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman ini beberapa saat lagi.</EmptyState>;
  }

  const c = counts.data;
  const draftN = c.draft ?? 0;
  const publishedN = c.published ?? 0;
  const unpublishedN = c.unpublished ?? 0;
  const totalN = Object.values(c).reduce((sum, n) => sum + (n ?? 0), 0);
  const researcherN = researchers.data.total;

  const steps = [
    { done: categories.length > 0 && faculties.length > 0, label: "Isi data acuan", hint: "Kategori dan fakultas dipakai saat menginput inovasi.", href: "/admin/taksonomi" },
    { done: researcherN > 0, label: "Tambahkan peneliti", hint: "Data dosen dari berkas yang mereka serahkan.", href: "/admin/peneliti/baru" },
    { done: totalN > 0, label: "Input inovasi pertama", hint: "Simpan sebagai draft, lengkapi, lalu terbitkan.", href: "/admin/inovasi/baru" },
  ];
  const onboarding = steps.some((s) => !s.done) && publishedN === 0;

  return (
    <>
      <section
        aria-labelledby="sapaan"
        className="relative overflow-hidden rounded-card bg-gradient-to-br from-primary to-brand p-6 text-white sm:p-8"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/10" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-24 size-48 rounded-full bg-white/10" />
        <div className="relative">
          <h1 id="sapaan" className="text-balance text-2xl font-extrabold sm:text-3xl">
            {greeting(new Date())}, {firstName(session.user.name)}!
          </h1>
          <p className="mt-2 max-w-2xl text-white/90">
            Ringkasan katalog inovasi: yang masih draft, yang sudah terbit, dan peneliti yang sudah terdata.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 border-t border-white/25 pt-5">
            <Link
              href="/admin/inovasi/baru"
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-white px-5 font-semibold text-primary transition-colors hover:bg-primary-tint"
            >
              <Plus className="size-5" aria-hidden="true" />
              Tambah inovasi
            </Link>
            <Link
              href="/admin/peneliti/baru"
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-white/70 px-5 font-semibold text-white transition-colors hover:bg-white/15"
            >
              <Plus className="size-5" aria-hidden="true" />
              Tambah peneliti
            </Link>
          </div>
        </div>
      </section>

      <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Lightbulb} label="Total inovasi" value={totalN} href="/admin/inovasi" />
        <Stat icon={Globe} label="Terbit" value={publishedN} href="/admin/inovasi?status=published" tone="brand" />
        <Stat icon={FilePenLine} label="Draft" value={draftN} href="/admin/inovasi?status=draft" tone="accent" />
        <Stat icon={EyeOff} label="Ditarik" value={unpublishedN} href="/admin/inovasi?status=unpublished" />
        <Stat icon={GraduationCap} label="Peneliti terdata" value={researcherN} href="/admin/peneliti" />
      </dl>

      {onboarding ? (
        <section aria-labelledby="mulai" className="mt-8 rounded-card border border-border bg-surface p-5 sm:p-6">
          <h2 id="mulai" className="text-lg font-bold">
            Mulai mengisi katalog
          </h2>
          <ol className="mt-4 space-y-3">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-start gap-3">
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="mt-0.5 size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div>
                  <Link href={s.href} className="font-semibold text-primary hover:underline">
                    {i + 1}. {s.label}
                  </Link>
                  <span className="sr-only">{s.done ? " (sudah)" : " (belum)"}</span>
                  <p className="text-sm text-muted-foreground">{s.hint}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          id="perlu-perhatian"
          title="Draft yang belum terbit"
          emptyText="Tidak ada draft. Semua inovasi sudah terbit atau ditarik."
          viewAll={draftN > 5 ? "/admin/inovasi?status=draft" : null}
          items={drafts.data.items}
        />
        <Panel
          id="terbaru"
          title="Terakhir diperbarui"
          emptyText="Belum ada inovasi."
          viewAll={totalN > 5 ? "/admin/inovasi" : null}
          items={recent.data.items}
        />
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
  tone?: "neutral" | "brand" | "accent";
}) {
  const bubble =
    tone === "brand" ? "bg-primary-tint text-primary" : tone === "accent" ? "bg-accent/30 text-accent-text" : "bg-background text-muted-foreground";
  return (
    <Link href={href} className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-md">
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-card ${bubble}`}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div>
        <dd className="text-2xl font-extrabold leading-none">{value}</dd>
        <dt className="mt-1 text-sm font-medium text-muted-foreground">{label}</dt>
      </div>
    </Link>
  );
}

function Panel({
  id,
  title,
  emptyText,
  viewAll,
  items,
}: {
  id: string;
  title: string;
  emptyText: string;
  viewAll: string | null;
  items: { id: string; title: string; status: Parameters<typeof StatusBadge>[0]["status"]; updatedAt: string }[];
}) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {viewAll ? (
          <Link href={viewAll} className="text-sm font-semibold text-primary hover:underline">
            Lihat semua
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={`/admin/inovasi/${item.id}`} className="block truncate font-semibold hover:text-primary hover:underline">
                  {item.title}
                </Link>
                <p className="text-sm text-muted-foreground">{formatDate(item.updatedAt)}</p>
              </div>
              <StatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-48 animate-pulse rounded-card bg-border" />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-border" />
        ))}
      </div>
    </div>
  );
}
