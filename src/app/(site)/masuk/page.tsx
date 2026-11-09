import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safeNextPath } from "@/modules/auth/safe-next";
import { getCurrentSession } from "@/platform/auth/current";
import { isDevLoginEnabled } from "@/platform/auth/dev-login";
import { DevLoginForm } from "./dev-login-form";
import { PasswordLoginForm } from "./password-login-form";

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

  return (
    <>
      <p className="mt-2 text-muted-foreground">
        Khusus operator dan administrator katalog. Pengunjung tidak perlu masuk untuk menjelajahi inovasi.
      </p>
      <PasswordLoginForm next={next} />
      <p className="mt-6 text-sm text-muted-foreground">
        Lupa kata sandi atau belum punya akun? Hubungi administrator untuk mengatur ulang atau membuatkan akun.
      </p>

      {isDevLoginEnabled() ? (
        <section aria-labelledby="mode-dev" className="mt-10 border-t border-border pt-6">
          <h2 id="mode-dev" className="sr-only">
            Masuk cepat untuk pengembangan
          </h2>
          <p role="note" className="flex gap-3 rounded-control bg-accent px-4 py-3 text-sm font-medium text-on-accent">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>
              <strong>Mode pengembangan.</strong> Bagian ini hanya muncul di komputer pengembang dan tidak ada di
              situs sebenarnya.
            </span>
          </p>
          <DevLoginForm next={next} />
        </section>
      ) : null}
    </>
  );
}
