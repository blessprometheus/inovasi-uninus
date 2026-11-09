import Link from "next/link";
import { csrfTokenFor, getCurrentSession } from "@/platform/auth/current";
import { isResearcherPortalEnabled } from "@/platform/config/features";
import { UserMenu } from "./user-menu";

/** Bagian header yang bergantung pada sesi. Dibungkus Suspense di SiteHeader (Cache Components). */
export async function HeaderAuth() {
  const session = await getCurrentSession();
  let csrf: string | null = null;
  if (session) {
    try {
      csrf = csrfTokenFor(session);
    } catch {
      // AUTH_SECRET belum diatur: tampilkan sebagai belum masuk daripada merusak seluruh halaman.
    }
  }

  if (!session || !csrf) {
    return (
      <Link
        href="/masuk"
        className="inline-flex min-h-11 items-center rounded-control border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary-tint"
      >
        Masuk
      </Link>
    );
  }
  return (
    <UserMenu
      name={session.user.name}
      csrf={csrf}
      showDashboard={isResearcherPortalEnabled() && session.user.permissions.has("innovation.create")}
      showAdmin={session.user.permissions.has("innovation.read_any")}
    />
  );
}
