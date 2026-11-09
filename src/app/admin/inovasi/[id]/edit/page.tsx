import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/catalog-ui";
import { loadFormRefs, toFormValues } from "@/components/innovation-form/form-data";
import { InnovationForm } from "@/components/innovation-form/innovation-form";
import { toAuthUser } from "@/modules/auth/auth-user";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getAdminInnovationService, getFilesService } from "@/platform/auth/runtime";
import { getUploadLimits } from "@/platform/config/uploads";
import { FilesManager } from "./files-manager";

export const metadata: Metadata = {
  title: "Edit Inovasi",
  robots: { index: false, follow: false },
};

export default function EditInnovationPage({ params }: PageProps<"/admin/inovasi/[id]/edit">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-card bg-border" aria-hidden="true" />}>
          <EditContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function EditContent({ params }: { params: PageProps<"/admin/inovasi/[id]/edit">["params"] }) {
  const { id } = await params;
  const session = await requireSession(`/admin/inovasi/${id}/edit`);
  const actor = toAuthUser(session.user);
  if (!actor.permissions.has("innovation.update_any")) {
    return (
      <div className="mt-8">
        <EmptyState title="Akun ini tidak memiliki akses admin">Halaman ini untuk operator dan administrator.</EmptyState>
      </div>
    );
  }
  const found = await getAdminInnovationService().get(actor, id);
  if (!found.ok) notFound();
  const inv = found.data;
  const [refs, initial] = await Promise.all([loadFormRefs(), toFormValues(inv)]);
  const files = await getFilesService().list(actor, id);
  const limits = getUploadLimits();
  return (
    <>
      <div className="mt-6">
        <Breadcrumb
          items={[{ href: "/admin/inovasi", label: "Inovasi" }, { href: `/admin/inovasi/${id}`, label: "Detail" }, { label: "Edit" }]}
        />
      </div>
      <h1 className="mt-4 text-balance text-3xl font-bold">Edit Inovasi</h1>
      {inv.status === "published" ? (
        <p role="note" className="mt-3 rounded-control bg-primary-tint p-3 text-sm">
          Inovasi ini sudah terbit. Perubahan yang Anda simpan langsung tampil di publik.
        </p>
      ) : null}
      <div className="mt-8">
        <InnovationForm
          csrf={csrfTokenFor(session)}
          mode="edit"
          scope="operator"
          id={id}
          status={inv.status}
          initial={initial}
          refs={refs}
        />
      </div>
      {files.ok ? (
        <FilesManager
          csrf={csrfTokenFor(session)}
          innovationId={id}
          files={files.data}
          maxImageMb={Math.round(limits.maxImageBytes / (1024 * 1024))}
          maxDocumentMb={Math.round(limits.maxDocumentBytes / (1024 * 1024))}
          maxFiles={limits.maxFilesPerInnovation}
        />
      ) : null}
    </>
  );
}
