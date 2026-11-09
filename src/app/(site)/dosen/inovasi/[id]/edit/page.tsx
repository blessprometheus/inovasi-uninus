import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { toAuthUser } from "@/modules/auth/auth-user";
import { isOwnerEditable } from "@/modules/workflow/transitions";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getInnovationService } from "@/platform/auth/runtime";
import { loadFormRefs, toFormValues } from "@/components/innovation-form/form-data";
import { InnovationForm } from "@/components/innovation-form/innovation-form";

export const metadata: Metadata = {
  title: "Edit Inovasi",
  robots: { index: false, follow: false },
};

export default function EditInnovationPage({ params }: PageProps<"/dosen/inovasi/[id]/edit">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-border" aria-hidden="true" />}>
          <EditContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function EditContent({ params }: { params: PageProps<"/dosen/inovasi/[id]/edit">["params"] }) {
  const { id } = await params;
  const session = await requireSession(`/dosen/inovasi/${id}/edit`);
  const found = await getInnovationService().getOwn(toAuthUser(session.user), id);
  if (!found.ok) notFound();
  const inv = found.data;

  // Status terkunci atau bukan pemilik: tampilkan mode baca, bukan formulir (UI_UX_GUIDELINES §10.7).
  if (!inv.isOwner || !isOwnerEditable(inv.status)) redirect(`/dosen/inovasi/${id}`);

  const [refs, initial] = await Promise.all([loadFormRefs(), toFormValues(inv)]);
  return (
    <>
      <Breadcrumb
        items={[
          { href: "/dosen", label: "Dashboard" },
          { href: `/dosen/inovasi/${id}`, label: "Detail pengajuan" },
          { label: "Edit" },
        ]}
      />
      <h1 className="mt-4 text-balance text-3xl font-bold">Edit Inovasi</h1>
      <div className="mt-8">
        <InnovationForm
          csrf={csrfTokenFor(session)}
          mode="edit"
          id={id}
          initial={initial}
          refs={refs}
          revisionNote={inv.revisionNote}
        />
      </div>
    </>
  );
}
