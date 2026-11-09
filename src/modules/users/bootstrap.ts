import { and, eq } from "drizzle-orm";
import { checkPasswordPolicy } from "@/modules/auth/password-policy";
import { recordAudit } from "@/platform/audit/audit";
import { normalizeEmail } from "@/platform/auth/local-auth";
import { hashPassword } from "@/platform/auth/password";
import type { Database } from "@/platform/db/client";
import { roles, sessions, userRoles, users } from "@/platform/db/schema";
import { z } from "@/platform/http/zod";

export type BootstrapResult =
  | { ok: true; created: boolean; userId: string }
  | { ok: false; message: string };

const emailSchema = z.string().max(254).pipe(z.email());

/**
 * Membuat (atau, dengan `reset`, mengatur ulang sandi) super admin dari server. Satu-satunya jalan
 * membuat akun pertama: sebelum ada super admin tidak ada yang bisa membuat akun lewat antarmuka.
 * Dipanggil `scripts/create-super-admin.ts`; sandinya dipilih orang yang menjalankannya, jadi tidak
 * dipaksa ganti, kecuali `temporary` (sandi sementara yang dibuatkan orang lain, wajib diganti saat masuk).
 */
export async function createSuperAdmin(
  db: Database,
  input: { email: string; name: string; password: string; reset?: boolean; temporary?: boolean },
): Promise<BootstrapResult> {
  const email = normalizeEmail(input.email);
  if (!emailSchema.safeParse(email).success) return { ok: false, message: "Email tidak valid." };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) return { ok: false, message: "Nama harus 2 sampai 120 karakter." };
  const problem = checkPasswordPolicy(input.password, { email, name });
  if (problem) return { ok: false, message: problem };

  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, "super_admin"));
  if (!role) return { ok: false, message: "Role belum ada. Jalankan `npm run db:seed` dulu." };

  const hash = await hashPassword(input.password);
  return db.transaction(async (tx): Promise<BootstrapResult> => {
    const [existing] = await tx.select().from(users).where(eq(users.email, email)).for("update");
    if (existing && !input.reset) {
      return { ok: false, message: "Email ini sudah terdaftar. Tambahkan --reset untuk mengatur ulang kata sandinya." };
    }

    let userId: string;
    if (existing) {
      userId = existing.id;
      await tx
        .update(users)
        .set({ name, passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: input.temporary === true, failedLoginCount: 0, lockedUntil: null, isActive: true, deletedAt: null })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    } else {
      const [row] = await tx
        .insert(users)
        .values({ email, name, passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: input.temporary === true })
        .returning({ id: users.id });
      userId = row.id;
    }

    const [granted] = await tx
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
    if (!granted) await tx.insert(userRoles).values({ userId, roleId: role.id });

    await recordAudit(tx, {
      actorId: null,
      action: existing ? "user.password_reset_cli" : "user.create_cli",
      entityType: "user",
      entityId: userId,
      changes: { role: "super_admin" },
    });
    return { ok: true, created: !existing, userId };
  });
}
