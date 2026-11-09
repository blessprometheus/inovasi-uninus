import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/catalog-ui";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getTaxonomyService } from "@/platform/auth/runtime";
import { EMPTY_RESEARCHER, ResearcherForm } from "../researcher-form";

export const metadata: Metadata = {
  title: "Tambah Peneliti",
  robots: { index: false, follow: false },
};

export default function NewResearcherPage() {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mt-6">
          <Breadcrumb items={[{ href: "/admin/peneliti", label: "Peneliti" }, { label: "Tambah" }]} />
        </div>
        <h1 className="mt-4 text-balance text-3xl font-bold">Tambah Peneliti</h1>
        <p className="mt-1 text-muted-foreground">
          Peneliti adalah data, bukan akun. NIDN/NIP tidak disimpan. Pastikan dosen sudah menyetujui datanya
          ditampilkan di publik.
        </p>
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-card bg-border" aria-hidden="true" />}>
          <NewForm />
        </Suspense>
      </div>
    </main>
  );
}

async function NewForm() {
  const session = await requireSession("/admin/peneliti/baru");
  if (!session.user.permissions.has("researcher.manage")) {
    return (
      <div className="mt-8">
        <EmptyState title="Akun ini tidak memiliki akses admin">Halaman ini untuk operator dan administrator.</EmptyState>
      </div>
    );
  }
  const taxonomy = getTaxonomyService();
  const [faculties, programs] = await Promise.all([taxonomy.listPublic("faculties"), taxonomy.listPublic("study-programs")]);
  return (
    <div className="mt-8">
      <ResearcherForm
        csrf={csrfTokenFor(session)}
        initial={EMPTY_RESEARCHER}
        faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
        studyPrograms={programs.map((s) => ({ id: s.id, name: s.name, facultyId: s.facultyId ?? "" }))}
      />
    </div>
  );
}
