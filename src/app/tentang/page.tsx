import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tentang",
  description:
    "Inovasi UNINUS adalah katalog digital hasil penelitian dan inovasi dosen Universitas Islam Nusantara.",
  alternates: { canonical: "/tentang" },
};

const STEPS = [
  {
    title: "Dosen mengajukan",
    body: "Dosen masuk dengan akun SSO UNINUS, mengisi data inovasi, lalu mengajukannya untuk diverifikasi.",
  },
  {
    title: "Operator memverifikasi",
    body: "Operator memeriksa kelengkapan dan kelayakan. Inovasi bisa disetujui, atau dikembalikan dengan catatan untuk diperbaiki.",
  },
  {
    title: "Dipublikasikan",
    body: "Hanya inovasi yang sudah disetujui dan dipublikasikan yang tampil di katalog ini.",
  },
] as const;

export default function AboutPage() {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-balance text-3xl font-bold sm:text-4xl">Tentang Inovasi UNINUS</h1>

        <div className="mt-6 flex max-w-prose flex-col gap-4 text-lg leading-relaxed">
          <p>
            Inovasi UNINUS adalah katalog digital hasil penelitian dan inovasi dosen Universitas
            Islam Nusantara. Tujuannya mengumpulkan inovasi yang selama ini tersebar di satu tempat,
            agar mudah ditemukan oleh masyarakat, industri, dan pemerintah.
          </p>
          <p>
            Setiap inovasi dilengkapi informasi tim peneliti, publikasi, dan status kekayaan
            intelektual bila ada, sehingga calon mitra dapat menilai dan menghubungi pihak yang
            tepat.
          </p>
        </div>

        <section aria-labelledby="alur" className="mt-12">
          <h2 id="alur" className="text-2xl font-bold">
            Bagaimana inovasi masuk ke katalog
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-card border border-border bg-surface p-5">
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-full bg-primary-tint font-bold text-primary"
                >
                  {i + 1}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-12">
          <Link
            href="/inovasi"
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Jelajahi katalog inovasi
          </Link>
        </p>
      </div>
    </main>
  );
}
