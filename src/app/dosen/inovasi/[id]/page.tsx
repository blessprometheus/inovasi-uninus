import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { StatusBadge } from "@/components/status-badge";
import { toAuthUser } from "@/modules/auth/auth-user";
import { isOwnerEditable } from "@/modules/workflow/transitions";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getInnovationService, getResearcherLookup } from "@/platform/auth/runtime";
import { formatDate, formatDateTime } from "@/platform/format/date";
import { loadFormRefs } from "../form-data";
import { InnovationActions } from "./innovation-actions";

export const metadata: Metadata = {
  title: "Detail Pengajuan",
  robots: { index: false, follow: false },
};

export default function InnovationDetailPage({ params }: PageProps<"/dosen/inovasi/[id]">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-border" aria-hidden="true" />}>
          <DetailContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

const LONG_TEXTS = [
  ["abstract", "Abstrak"],
  ["background", "Latar belakang"],
  ["problemStatement", "Rumusan masalah"],
  ["objective", "Tujuan"],
  ["methodology", "Metodologi"],
  ["description", "Deskripsi inovasi"],
  ["advantages", "Keunggulan"],
  ["benefits", "Manfaat"],
  ["developmentPotential", "Potensi pengembangan"],
] as const;

const IP_KIND = { hki: "HKI", paten: "Paten", lainnya: "Lainnya" } as const;

async function DetailContent({ params }: { params: PageProps<"/dosen/inovasi/[id]">["params"] }) {
  const { id } = await params;
  const session = await requireSession(`/dosen/inovasi/${id}`);
  const actor = toAuthUser(session.user);
  const service = getInnovationService();

  const found = await service.getOwn(actor, id);
  if (!found.ok) notFound();
  const inv = found.data;
  const history = await service.history(actor, id);

  const refs = await loadFormRefs();
  const ids = [...(inv.leadResearcherId ? [inv.leadResearcherId] : []), ...inv.memberResearcherIds];
  const people = new Map((await getResearcherLookup().byIds(ids)).map((p) => [p.id, p.fullName]));
  const lookupName = (list: { id: string; name: string }[], value: string | null) =>
    list.find((x) => x.id === value)?.name ?? null;

  const facts: [string, string | null][] = [
    ["Kategori", inv.categoryIds.map((c) => lookupName(refs.categories, c)).filter(Boolean).join(", ") || null],
    ["Jenis", lookupName(refs.types, inv.typeId)],
    ["Tahun", inv.year?.toString() ?? null],
    ["Fakultas", lookupName(refs.faculties, inv.facultyId)],
    ["Program studi", lookupName(refs.studyPrograms, inv.studyProgramId)],
    ["Ketua peneliti", inv.leadResearcherId ? (people.get(inv.leadResearcherId) ?? null) : null],
    [
      "Anggota tim",
      inv.memberResearcherIds.map((m) => people.get(m)).filter(Boolean).join(", ") || null,
    ],
  ];

  const canEdit = inv.isOwner && isOwnerEditable(inv.status);

  return (
    <>
      <Breadcrumb items={[{ href: "/dosen", label: "Dashboard" }, { label: "Detail pengajuan" }]} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 basis-72 text-balance text-3xl font-bold">{inv.title}</h1>
        <StatusBadge status={inv.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Diperbarui {formatDate(inv.updatedAt)}
        {inv.isOwner ? "" : " · Anda anggota tim (hanya baca)"}
      </p>

      {inv.revisionNote ? (
        <div role="note" className="mt-6 rounded-card border border-border bg-status-revision-bg p-4 text-status-revision-fg">
          <p className="font-semibold">Operator meminta revisi</p>
          <p className="mt-1 whitespace-pre-line">{inv.revisionNote}</p>
        </div>
      ) : null}

      {inv.isOwner ? (
        <div className="mt-6">
          <InnovationActions
            id={inv.id}
            csrf={csrfTokenFor(session)}
            canEdit={canEdit}
            canWithdraw={inv.status === "submitted"}
            canDelete={inv.status === "draft"}
          />
        </div>
      ) : null}

      {inv.status === "published" ? (
        <p className="mt-6">
          <Link
            href={`/inovasi/${inv.slug}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-control font-semibold text-primary hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Lihat di katalog publik
          </Link>
        </p>
      ) : null}

      <section aria-labelledby="ringkasan" className="mt-8 rounded-card border border-border bg-surface p-5 sm:p-6">
        <h2 id="ringkasan" className="text-xl font-semibold">
          Ringkasan
        </h2>
        <p className="mt-2 whitespace-pre-line">{inv.summary}</p>
        <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      {LONG_TEXTS.filter(([key]) => inv[key]).map(([key, label]) => (
        <section key={key} aria-labelledby={`t-${key}`} className="mt-6 rounded-card border border-border bg-surface p-5 sm:p-6">
          <h2 id={`t-${key}`} className="text-xl font-semibold">
            {label}
          </h2>
          <p className="mt-2 whitespace-pre-line">{inv[key]}</p>
        </section>
      ))}

      {inv.publications.length > 0 ? (
        <section aria-labelledby="publikasi" className="mt-6 rounded-card border border-border bg-surface p-5 sm:p-6">
          <h2 id="publikasi" className="text-xl font-semibold">
            Publikasi
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {inv.publications.map((p, i) => (
              <li key={i}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-primary hover:underline">
                    {p.title}
                  </a>
                ) : (
                  <span className="font-semibold">{p.title}</span>
                )}
                <span className="text-muted-foreground">
                  {[p.venue, p.year, p.doi ? `DOI ${p.doi}` : null].filter(Boolean).map((x) => ` · ${x}`).join("")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inv.intellectualProperties.length > 0 ? (
        <section aria-labelledby="hki" className="mt-6 rounded-card border border-border bg-surface p-5 sm:p-6">
          <h2 id="hki" className="text-xl font-semibold">
            HKI / Paten
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {inv.intellectualProperties.map((p, i) => (
              <li key={i}>
                <span className="font-semibold">{IP_KIND[p.kind]}</span>
                {[p.status, p.registrationNumber, p.year, p.notes].filter(Boolean).map((x) => ` · ${x}`).join("")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {history.ok ? (
        <section aria-labelledby="riwayat" className="mt-6 rounded-card border border-border bg-surface p-5 sm:p-6">
          <h2 id="riwayat" className="text-xl font-semibold">
            Riwayat status
          </h2>
          <ol className="mt-4 space-y-4 border-l-2 border-border pl-5">
            {history.data.map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.6rem] top-1.5 size-3 rounded-full border-2 border-brand bg-surface" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge status={h.toStatus} />
                  <time dateTime={h.createdAt} className="text-sm text-muted-foreground">
                    {formatDateTime(h.createdAt)}
                  </time>
                </div>
                {h.note ? <p className="mt-1 whitespace-pre-line text-sm">{h.note}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
