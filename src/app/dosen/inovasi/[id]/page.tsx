import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { InnovationReadonly } from "@/components/innovation-readonly";
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

      <InnovationReadonly inv={inv} refs={refs} people={people} />

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
