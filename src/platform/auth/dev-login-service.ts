import { and, eq } from "drizzle-orm";
import type { RoleCode } from "@/modules/auth/permissions";
import type { Database } from "@/platform/db/client";
import { researchers, roles, userRoles, users } from "@/platform/db/schema";

export class DevLoginError extends Error {}

/**
 * Menyiapkan pengguna uji untuk login pengembangan. `sso_subject` berawalan "dev:" supaya tidak
 * pernah bertabrakan dengan subjek SSO asli. Role hanya ditambah, tidak dicabut.
 */
export async function ensureDevUser(
  db: Database,
  input: { email: string; name: string; role: RoleCode },
): Promise<{ id: string }> {
  const email = input.email.toLowerCase();
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, input.role));
  if (!role) throw new DevLoginError("Role belum ada di database. Jalankan `npm run db:seed` dulu.");

  const [user] = await db
    .insert(users)
    .values({ ssoSubject: `dev:${email}`, email, name: input.name })
    .onConflictDoUpdate({ target: users.ssoSubject, set: { name: input.name, updatedAt: new Date() } })
    .returning({ id: users.id });

  const [granted] = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, role.id)));
  if (!granted) await db.insert(userRoles).values({ userId: user.id, roleId: role.id });

  // Profil peneliti nyata nanti dibuat dari klaim SSO. Untuk dev dibuat tertutup (tidak tampil di /peneliti)
  // supaya form inovasi punya ketua default tanpa mengotori direktori publik.
  await db
    .insert(researchers)
    .values({ userId: user.id, slug: `dev-${user.id}`, fullName: input.name, isPublic: false })
    .onConflictDoNothing({ target: researchers.userId });

  return user;
}
