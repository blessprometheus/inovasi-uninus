import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/catalog-ui";
import { toAuthUser } from "@/modules/auth/auth-user";
import { csrfTokenFor, requireSession } from "@/platform/auth/current";
import { getUsersService } from "@/platform/auth/runtime";
import { UsersManager } from "./users-manager";

export const metadata: Metadata = {
  title: "Kelola Akun",
  robots: { index: false, follow: false },
};

export default function UsersPage() {
  return (
    <main id="konten" className="flex-1">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-balance text-3xl font-bold">Akun</h1>
        <Suspense fallback={<div aria-hidden="true" className="mt-8 h-64 animate-pulse rounded-card bg-border" />}>
          <UsersContent />
        </Suspense>
      </div>
    </main>
  );
}

async function UsersContent() {
  const session = await requireSession("/admin/pengguna");
  const actor = toAuthUser(session.user);
  if (!actor.permissions.has("user.manage")) {
    return (
      <div className="mt-8">
        <EmptyState title="Halaman ini khusus super admin">Minta super admin untuk mengelola akun.</EmptyState>
      </div>
    );
  }
  const result = await getUsersService().list(actor);
  if (!result.ok) {
    return (
      <div className="mt-8">
        <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman ini beberapa saat lagi.</EmptyState>
      </div>
    );
  }
  return <UsersManager csrf={csrfTokenFor(session)} currentUserId={session.user.id} users={result.data} />;
}
