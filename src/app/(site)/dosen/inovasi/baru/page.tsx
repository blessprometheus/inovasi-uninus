import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getResearcherLookup } from "@/platform/auth/runtime";
import { loadFormRefs } from "@/components/innovation-form/form-data";
import { EMPTY_VALUES } from "@/components/innovation-form/form-types";
import { InnovationForm } from "@/components/innovation-form/innovation-form";

export const metadata: Metadata = {
  title: "Ajukan Inovasi",
  robots: { index: false, follow: false },
};

export default function NewInnovationPage() {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Breadcrumb
          items={[
            { href: "/dosen", label: "Dashboard" },
            { label: "Ajukan inovasi" },
          ]}
        />
        <h1 className="mt-4 text-balance text-3xl font-bold">Ajukan Inovasi</h1>
        <p className="mt-1 text-muted-foreground">
          Simpan sebagai draft dulu, lalu lengkapi bertahap. Anda dapat mengajukannya kapan saja setelah bagian wajib
          terisi.
        </p>
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-card bg-border" aria-hidden="true" />}>
          <NewForm />
        </Suspense>
      </div>
    </main>
  );
}

async function NewForm() {
  const session = await requireSession("/dosen/inovasi/baru");
  if (!session.user.permissions.has("innovation.create")) {
    return <p className="mt-8 text-muted-foreground">Akun ini tidak memiliki akses untuk mengajukan inovasi.</p>;
  }
  const [refs, own] = await Promise.all([loadFormRefs(), getResearcherLookup().byUserId(session.user.id)]);
  return (
    <div className="mt-8">
      <InnovationForm
        csrf={csrfTokenFor(session)}
        mode="create"
        initial={{ ...EMPTY_VALUES, lead: own ? { id: own.id, name: own.fullName } : null }}
        refs={refs}
      />
    </div>
  );
}
