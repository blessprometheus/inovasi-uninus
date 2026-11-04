"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "./api-client";

export function UserMenu({
  name,
  csrf,
  showDashboard,
  showAdmin,
}: {
  name: string;
  csrf: string;
  showDashboard: boolean;
  showAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await apiRequest("POST", "/api/v1/auth/logout", { csrf, body: {} });
    // refresh() membuang cache router sehingga header dan halaman terlindungi ikut menjadi "belum masuk".
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      {showDashboard ? (
        <Link
          href="/dosen"
          className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary-tint hover:text-primary"
        >
          Dashboard
        </Link>
      ) : null}
      {showAdmin ? (
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary-tint hover:text-primary"
        >
          Admin
        </Link>
      ) : null}
      <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground lg:inline" title={name}>
        {name}
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary-tint hover:text-primary disabled:cursor-wait disabled:opacity-60"
      >
        <LogOut className="size-4" aria-hidden="true" />
        {busy ? "Keluar…" : "Keluar"}
      </button>
    </div>
  );
}
