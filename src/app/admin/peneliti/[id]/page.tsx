import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/catalog-ui";
import { toAuthUser } from "@/modules/auth/auth-user";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getAdminResearcherService, getTaxonomyService } from "@/platform/auth/runtime";
import { ResearcherForm } from "../researcher-form";

export const metadata: Metadata = {
  title: "Edit Peneliti",
  robots: { index: false, follow: false },
};

export default function EditResearcherPage({ params }: PageProps<"/admin/peneliti/[id]">) {
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

async function EditContent({ params }: { params: PageProps<"/admin/peneliti/[id]">["params"] }) {
  const { id } = await params;
  const session = await requireSession(`/admin/peneliti/${id}`);
  const actor = toAuthUser(session.user);
  if (!actor.permissions.has("researcher.manage")) {
    return (
      <div className="mt-8">
        <EmptyState title="Akun ini tidak memiliki akses admin">Halaman ini untuk operator dan administrator.</EmptyState>
      </div>
    );
  }
  const found = await getAdminResearcherService().get(actor, id);
  if (!found.ok) notFound();
  const r = found.data;
  const taxonomy = getTaxonomyService();
  const [faculties, programs] = await Promise.all([taxonomy.listPublic("faculties"), taxonomy.listPublic("study-programs")]);
  return (
    <>
      <div className="mt-6">
        <Breadcrumb items={[{ href: "/admin/peneliti", label: "Peneliti" }, { label: "Edit" }]} />
      </div>
      <h1 className="mt-4 text-balance text-3xl font-bold">Edit Peneliti</h1>
      <p className="mt-1 text-muted-foreground">
        Tercantum di {r.innovationCount} inovasi. Alamat profil publik tidak berubah meski nama diedit.
      </p>
      <div className="mt-8">
        <ResearcherForm
          csrf={csrfTokenFor(session)}
          id={id}
          innovationCount={r.innovationCount}
          initial={{
            fullName: r.fullName,
            position: r.position ?? "",
            facultyId: r.facultyId ?? "",
            studyProgramId: r.studyProgramId ?? "",
            bio: r.bio ?? "",
            externalLinks: r.externalLinks,
            isPublic: r.isPublic,
          }}
          faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
          studyPrograms={programs.map((s) => ({ id: s.id, name: s.name, facultyId: s.facultyId ?? "" }))}
        />
      </div>
    </>
  );
}
