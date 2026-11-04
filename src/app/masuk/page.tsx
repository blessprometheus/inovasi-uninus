import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safeNextPath } from "@/modules/auth/safe-next";
import { getCurrentSession } from "@/platform/auth/current";
import { isDevLoginEnabled } from "@/platform/auth/dev-login";
import { DevLoginForm } from "./dev-login-form";

export const metadata: Metadata = {
  title: "Masuk",
  robots: { index: false, follow: false },
};

export default function LoginPage({ searchParams }: PageProps<"/masuk">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="text-balance text-3xl font-bold">Masuk</h1>
        {/* searchParams, cookie, dan env dibaca saat request: harus di dalam Suspense. */}
        <Suspense fallback={<p className="mt-6 text-muted-foreground">Memuat…</p>}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/masuk">["searchParams"] }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentSession()) redirect(next);

  if (isDevLoginEnabled()) {
    return (
      <>
        <p role="note" className="mt-4 flex gap-3 rounded-control bg-accent px-4 py-3 text-sm font-medium text-on-accent">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>
            <strong>Mode pengembangan.</strong> Halaman ini hanya muncul di komputer pengembang dan tidak ada di
            situs sebenarnya.
          </span>
        </p>
        <DevLoginForm next={next} />
      </>
    );
  }

  return (
    <div className="mt-4 space-y-3 text-base text-muted-foreground">
      <p>
        Dosen dan staf UNINUS akan masuk memakai akun SSO UNINUS (Google @uninus.ac.id). Fitur ini sedang disiapkan
        dan belum dapat digunakan.
      </p>
      <p>Katalog inovasi tetap dapat dijelajahi tanpa masuk.</p>
    </div>
  );
}
