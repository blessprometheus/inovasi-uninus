import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/catalog-ui";
import { loadFormRefs } from "@/components/innovation-form/form-data";
import { EMPTY_VALUES } from "@/components/innovation-form/form-types";
import { InnovationForm } from "@/components/innovation-form/innovation-form";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";

export const metadata: Metadata = {
  title: "Tambah Inovasi",
  robots: { index: false, follow: false },
};

export default function NewInnovationPage() {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mt-6">
          <Breadcrumb items={[{ href: "/admin/inovasi", label: "Inovasi" }, { label: "Tambah" }]} />
        </div>
        <h1 className="mt-4 text-balance text-3xl font-bold">Tambah Inovasi</h1>
        <p className="mt-1 text-muted-foreground">
          Salin dari berkas yang diserahkan dosen. Simpan sebagai draft dulu dan lengkapi bertahap; terbitkan setelah
          bagian wajib terisi dan datanya sudah diperiksa. Sampul dan dokumen dapat diunggah setelah draft pertama
          tersimpan.
        </p>
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-card bg-border" aria-hidden="true" />}>
          <NewForm />
        </Suspense>
      </div>
    </main>
  );
}

async function NewForm() {
  const session = await requireSession("/admin/inovasi/baru");
  const perms = session.user.permissions;
  if (!perms.has("innovation.read_any") || !perms.has("innovation.create")) {
    return (
      <div className="mt-8">
        <EmptyState title="Akun ini tidak memiliki akses admin">Halaman ini untuk operator dan administrator.</EmptyState>
      </div>
    );
  }
  const refs = await loadFormRefs();
  return (
    <div className="mt-8">
      <InnovationForm csrf={csrfTokenFor(session)} mode="create" scope="operator" initial={EMPTY_VALUES} refs={refs} />
    </div>
  );
}
