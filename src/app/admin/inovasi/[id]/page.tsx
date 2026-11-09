import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadFormRefs } from "@/components/innovation-form/form-data";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/catalog-ui";
import { InnovationReadonly } from "@/components/innovation-readonly";
import { StatusBadge } from "@/components/status-badge";
import { toAuthUser } from "@/modules/auth/auth-user";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getAdminInnovationService, getResearcherLookup } from "@/platform/auth/runtime";
import { formatDate, formatDateTime } from "@/platform/format/date";
import { ReviewPanel } from "./review-panel";

export const metadata: Metadata = {
  title: "Detail Inovasi",
  robots: { index: false, follow: false },
};

export default function ReviewPage({ params }: PageProps<"/admin/inovasi/[id]">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-card bg-border" aria-hidden="true" />}>
          <ReviewContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function ReviewContent({ params }: { params: PageProps<"/admin/inovasi/[id]">["params"] }) {
  const { id } = await params;
  const session = await requireSession(`/admin/inovasi/${id}`);
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

  const found = await getAdminInnovationService().get(actor, id);
  if (!found.ok) notFound();
  const inv = found.data;

  const refs = await loadFormRefs();
  const ids = [...(inv.leadResearcherId ? [inv.leadResearcherId] : []), ...inv.memberResearcherIds];
  const people = new Map((await getResearcherLookup().byIds(ids)).map((p) => [p.id, p.fullName]));
  const perms = session.user.permissions;

  return (
    <>
      <div className="mt-6">
        <Breadcrumb items={[{ href: "/admin/inovasi", label: "Inovasi" }, { label: "Detail" }]} />
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 basis-72 text-balance text-3xl font-bold">{inv.title}</h1>
        <StatusBadge status={inv.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Diinput oleh {inv.submitter.name} · Diperbarui {formatDate(inv.updatedAt)}
      </p>

      <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <InnovationReadonly inv={inv} refs={refs} people={people} />

          <section aria-labelledby="riwayat" className="mt-6 rounded-card border border-border bg-surface p-5 sm:p-6">
            <h2 id="riwayat" className="text-xl font-semibold">
              Riwayat status
            </h2>
            <ol className="mt-4 space-y-4 border-l-2 border-border pl-5">
              {inv.history.map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[1.6rem] top-1.5 size-3 rounded-full border-2 border-brand bg-surface" aria-hidden="true" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusBadge status={h.toStatus} />
                    <time dateTime={h.createdAt} className="text-sm text-muted-foreground">
                      {formatDateTime(h.createdAt)}
                    </time>
                    {h.actorName ? <span className="text-sm text-muted-foreground">oleh {h.actorName}</span> : null}
                  </div>
                  {h.note ? <p className="mt-1 whitespace-pre-line text-sm">{h.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="mt-8">
            <ReviewPanel
              id={inv.id}
              csrf={csrfTokenFor(session)}
              status={inv.status}
              canReview={perms.has("innovation.review")}
              canPublish={perms.has("innovation.publish")}
              canDelete={perms.has("innovation.delete_any")}
              canEdit={perms.has("innovation.update_any")}
              isOwnSubmission={inv.submitter.id === session.user.id}
            />
          </div>
        </div>
      </div>
    </>
  );
}
