import Link from "next/link";
import { EmptyState } from "@/components/catalog-ui";

export default function NotFound() {
  return (
    <main id="konten" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-16 sm:px-6 lg:px-8">
      <EmptyState
        title="Halaman tidak ditemukan"
        action={
          <Link
            href="/inovasi"
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-6 font-semibold text-on-primary hover:bg-primary-hover"
          >
            Lihat katalog inovasi
          </Link>
        }
      >
        Alamat yang Anda buka tidak ada atau inovasinya belum dipublikasikan.
      </EmptyState>
    </main>
  );
}
