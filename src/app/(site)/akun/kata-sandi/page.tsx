import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNextPath } from "@/modules/auth/safe-next";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Ganti Kata Sandi",
  robots: { index: false, follow: false },
};

export default function PasswordPage({ searchParams }: PageProps<"/akun/kata-sandi">) {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="text-balance text-3xl font-bold">Ganti Kata Sandi</h1>
        <Suspense fallback={<p className="mt-6 text-muted-foreground">Memuat…</p>}>
          <PasswordContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function PasswordContent({ searchParams }: { searchParams: PageProps<"/akun/kata-sandi">["searchParams"] }) {
  const next = safeNextPath((await searchParams).next);
  // Halaman ini satu-satunya yang boleh dibuka akun bersandi sementara.
  const session = await requireSession("/akun/kata-sandi", { allowPasswordChange: true });
  const forced = session.user.mustChangePassword;
  return (
    <>
      <p className="mt-2 text-muted-foreground">
        {forced
          ? "Kata sandi Anda masih sementara. Buat kata sandi baru yang hanya Anda ketahui sebelum melanjutkan."
          : "Setelah diganti, perangkat lain yang sedang masuk dengan akun ini akan keluar otomatis."}
      </p>
      <PasswordForm csrf={csrfTokenFor(session)} email={session.user.email} next={next} forced={forced} />
    </>
  );
}
