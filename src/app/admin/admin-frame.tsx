"use client";

import {
  ExternalLink,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  ShieldCheck,
  Tags,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "@/components/api-client";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Dashboard hanya aktif di jalur persis; yang lain juga untuk anak jalurnya. */
  exact?: boolean;
}

const MAIN: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/inovasi", label: "Inovasi", icon: Lightbulb },
  { href: "/admin/peneliti", label: "Peneliti", icon: GraduationCap },
  { href: "/admin/taksonomi", label: "Data acuan", icon: Tags },
];

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm font-semibold transition-colors";

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-3 rounded-control">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-white">
        <Image src="/brand/logo-uninus.png" alt="" width={73} height={100} className="h-7 w-auto" />
      </span>
      <span className="leading-tight">
        <span className="block text-base font-extrabold tracking-tight text-white">Inovasi UNINUS</span>
        <span className="block text-xs font-semibold tracking-widest text-white/80">ADMIN</span>
      </span>
    </Link>
  );
}

function SidebarNav({
  showUsers,
  csrf,
  onNavigate,
}: {
  showUsers: boolean;
  csrf: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));
  const link = (item: NavItem) => {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`${ITEM} ${active ? "bg-white text-primary" : "text-white hover:bg-white/15"}`}
        >
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          {item.label}
        </Link>
      </li>
    );
  };

  async function logout() {
    setBusy(true);
    await apiRequest("POST", "/api/v1/auth/logout", { csrf, body: {} });
    router.replace("/");
    router.refresh();
  }

  return (
    <nav aria-label="Menu admin" className="flex-1 overflow-y-auto px-3 pb-4">
      <p className="px-3 pb-2 pt-4 text-xs font-bold tracking-widest text-white/70">MENU UTAMA</p>
      <ul className="space-y-1">{MAIN.map(link)}</ul>

      {showUsers ? (
        <>
          <p className="px-3 pb-2 pt-6 text-xs font-bold tracking-widest text-white/70">PENGATURAN</p>
          <ul className="space-y-1">{link({ href: "/admin/pengguna", label: "Akun", icon: ShieldCheck })}</ul>
        </>
      ) : null}

      <p className="px-3 pb-2 pt-6 text-xs font-bold tracking-widest text-white/70">PINTASAN</p>
      <ul className="space-y-1">
        <li>
          <Link href="/" onClick={onNavigate} className={`${ITEM} text-white hover:bg-white/15`}>
            <ExternalLink className="size-5 shrink-0" aria-hidden="true" />
            Lihat situs publik
          </Link>
        </li>
        <li>
          <Link href="/akun/kata-sandi" onClick={onNavigate} className={`${ITEM} text-white hover:bg-white/15`}>
            <KeyRound className="size-5 shrink-0" aria-hidden="true" />
            Ganti kata sandi
          </Link>
        </li>
        <li>
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className={`${ITEM} cursor-pointer text-white hover:bg-white/15 disabled:cursor-wait disabled:opacity-60`}
          >
            <LogOut className="size-5 shrink-0" aria-hidden="true" />
            {busy ? "Keluar…" : "Keluar"}
          </button>
        </li>
      </ul>
    </nav>
  );
}

/**
 * Kerangka dashboard admin: sidebar hijau di layar lebar, bilah atas + laci menu di layar sempit.
 * Konten halaman dilewatkan sebagai `children` dari Server Component.
 */
export function AdminFrame({
  name,
  roleLabel,
  csrf,
  showUsers,
  children,
}: {
  name: string;
  roleLabel: string;
  csrf: string;
  showUsers: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  // Laci tertutup sendiri saat berpindah halaman (state turunan dari path, bukan effect).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const initial = name.replace(/^\[[^\]]*\]\s*/, "").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="lg:flex lg:min-h-screen">
      <aside className="hidden w-64 shrink-0 bg-primary lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <SidebarNav showUsers={showUsers} csrf={csrf} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="laci-menu"
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control text-primary hover:bg-primary-tint lg:hidden"
          >
            <Menu className="size-6" aria-hidden="true" />
            <span className="sr-only">Buka menu admin</span>
          </button>
          <p className="hidden text-sm font-semibold text-muted-foreground lg:block">Panel pengelola katalog</p>
          <p className="font-extrabold text-primary lg:hidden">Inovasi UNINUS</p>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-brand text-lg font-bold text-white"
            >
              {initial}
            </span>
            <span className="hidden text-right leading-tight sm:block">
              <span className="block max-w-[14rem] truncate text-sm font-bold" title={name}>
                {name}
              </span>
              <span className="block text-xs font-semibold tracking-wider text-muted-foreground">{roleLabel}</span>
            </span>
          </div>
        </header>

        {children}
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <aside
            id="laci-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu admin"
            className="relative flex h-full w-72 max-w-[85vw] flex-col bg-primary"
          >
            <div className="flex items-center justify-between px-5 py-4">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control text-white hover:bg-white/15"
              >
                <X className="size-6" aria-hidden="true" />
                <span className="sr-only">Tutup menu</span>
              </button>
            </div>
            <SidebarNav showUsers={showUsers} csrf={csrf} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
