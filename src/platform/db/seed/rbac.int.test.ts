import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, type RoleCode } from "../../../modules/auth/permissions";
import { permissions, rolePermissions, roles } from "../schema";
import { resetTestDb, setupTestDb } from "../testing";
import { seedRbac } from "./rbac";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
});

async function permissionCodesOf(roleCode: string): Promise<string[]> {
  const rows = await ctx.db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(roles.code, roleCode));
  return rows.map((r) => r.code).sort();
}

describe("seedRbac", () => {
  it("mengisi semua permission dan tiga role sesuai USER_ROLES.md", async () => {
    await seedRbac(ctx.db);
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(permissions);
    expect(n).toBe(Object.keys(PERMISSIONS).length);
    for (const role of Object.keys(ROLE_PERMISSIONS) as RoleCode[]) {
      expect(await permissionCodesOf(role), role).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });

  it("hak akses terpisah: researcher tidak punya izin review/admin, operator tidak punya izin super admin", async () => {
    await seedRbac(ctx.db);
    const researcher = await permissionCodesOf("researcher");
    const operator = await permissionCodesOf("operator");
    for (const p of ["innovation.review", "innovation.publish", "user.manage", "audit.read", "role.assign"]) {
      expect(researcher).not.toContain(p);
    }
    for (const p of ["user.manage", "role.assign", "settings.manage", "audit.read"]) {
      expect(operator).not.toContain(p);
    }
    expect(operator).toContain("innovation.review");
  });

  it("idempotent: dijalankan dua kali tidak menggandakan data", async () => {
    await seedRbac(ctx.db);
    await seedRbac(ctx.db);
    const [{ r }] = await ctx.db.select({ r: sql<number>`count(*)::int` }).from(roles);
    const [{ rp }] = await ctx.db.select({ rp: sql<number>`count(*)::int` }).from(rolePermissions);
    expect(r).toBe(3);
    const expected = Object.values(ROLE_PERMISSIONS).reduce((a, p) => a + p.length, 0);
    expect(rp).toBe(expected);
  });
});
