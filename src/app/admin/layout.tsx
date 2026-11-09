import { Suspense } from "react";
import { csrfTokenFor, getCurrentSession } from "@/platform/auth/current";
import { AdminFrame } from "./admin-frame";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "SUPER ADMIN",
  operator: "OPERATOR",
};

/**
 * Kerangka seluruh /admin: sidebar, bilah atas, dan konten. Tanpa sesi hanya meneruskan konten
 * (setiap halaman admin sendiri yang mengarahkan ke /masuk), jadi layout ini bukan lapisan keamanan.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-hidden="true" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) return children;

  let csrf = "";
  try {
    csrf = csrfTokenFor(session);
  } catch {
    // AUTH_SECRET belum diatur: tombol keluar tidak akan berhasil, tetapi halaman tetap tampil.
  }
  const { roles, permissions } = session.user;
  const role = roles.includes("super_admin") ? "super_admin" : "operator";
  return (
    <AdminFrame
      name={session.user.name}
      roleLabel={ROLE_LABEL[role]}
      csrf={csrf}
      showUsers={permissions.has("user.manage")}
    >
      {children}
    </AdminFrame>
  );
}
