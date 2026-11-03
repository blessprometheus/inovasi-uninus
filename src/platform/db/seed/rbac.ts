import { eq, inArray } from "drizzle-orm";
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  type PermissionCode,
  type RoleCode,
} from "../../../modules/auth/permissions";
import type { Database } from "../client";
import { permissions, rolePermissions, roles } from "../schema";

/**
 * Seed produksi: hanya roles, permissions, dan role_permissions (DATABASE_DESIGN.md §7).
 * Idempotent: aman dijalankan berulang, dan menyelaraskan role_permissions dengan kode.
 */
export async function seedRbac(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    const permCodes = Object.keys(PERMISSIONS) as PermissionCode[];
    for (const code of permCodes) {
      await tx
        .insert(permissions)
        .values({ code, description: PERMISSIONS[code] })
        .onConflictDoUpdate({ target: permissions.code, set: { description: PERMISSIONS[code] } });
    }

    const roleCodes = Object.keys(ROLES) as RoleCode[];
    for (const code of roleCodes) {
      await tx
        .insert(roles)
        .values({ code, name: ROLES[code], isSystem: true })
        .onConflictDoUpdate({ target: roles.code, set: { name: ROLES[code], isSystem: true } });
    }

    const permRows = await tx.select().from(permissions).where(inArray(permissions.code, permCodes));
    const permIdByCode = new Map(permRows.map((p) => [p.code, p.id]));
    const roleRows = await tx.select().from(roles).where(inArray(roles.code, roleCodes));

    for (const role of roleRows) {
      const wanted = ROLE_PERMISSIONS[role.code as RoleCode];
      // Selaraskan penuh: hapus lalu isi ulang agar pencabutan permission di kode ikut berlaku.
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      await tx.insert(rolePermissions).values(
        wanted.map((code) => ({ roleId: role.id, permissionId: permIdByCode.get(code)! })),
      );
    }
  });
}
