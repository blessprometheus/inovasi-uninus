import Image from "next/image";
import Link from "next/link";

/** Hanya tautan ke halaman yang sudah ada. Tambahkan menu baru bersamaan dengan halamannya. */
const NAV = [
  { href: "/inovasi", label: "Inovasi" },
  { href: "/peneliti", label: "Peneliti" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-control">
          <Image
            src="/brand/logo-uninus.png"
            alt=""
            width={73}
            height={100}
            className="h-10 w-auto"
            priority
          />
          <span className="leading-tight">
            <span className="block text-base font-extrabold tracking-tight text-primary">
              INOVASI UNINUS
            </span>
            <span className="block text-xs font-medium text-muted-foreground">
              Universitas Islam Nusantara
            </span>
          </span>
        </Link>
        <nav aria-label="Navigasi utama">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-foreground transition-colors hover:bg-primary-tint hover:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
