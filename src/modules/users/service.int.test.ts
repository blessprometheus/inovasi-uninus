import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@/modules/auth/authorize";
import { ROLE_PERMISSIONS, type RoleCode } from "@/modules/auth/permissions";
import type { ServiceResult } from "@/modules/innovations/service-core";
import { createAuthHandlers } from "@/platform/auth/handlers";
import { hashPassword } from "@/platform/auth/password";
import { createSession } from "@/platform/auth/session-store";
import { seedRbac } from "@/platform/db/seed/rbac";
import { auditLogs, roles, sessions, userRoles, users } from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createUsersService } from "./service";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
const svc = () => createUsersService(ctx.db);

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
  await seedRbac(ctx.db);
});

let n = 0;
async function makeUser(role: RoleCode, over: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await ctx.db
    .insert(users)
    .values({ email: `u${++n}@uninus.ac.id`, name: `[DUMMY] ${role} ${n}`, passwordHash: await hashPassword("kata-sandi-awal-123"), ...over })
    .returning();
  const [r] = await ctx.db.select().from(roles).where(eq(roles.code, role));
  await ctx.db.insert(userRoles).values({ userId: u.id, roleId: r.id });
  const actor: AuthUser = { id: u.id, permissions: new Set(ROLE_PERMISSIONS[role]) };
  return { u, actor };
}

function ok<T>(r: ServiceResult<T>): T {
  if (!r.ok) throw new Error(`Diharapkan ok, dapat ${r.code}: ${r.message}`);
  return r.data;
}
function fails<T>(r: ServiceResult<T>, code: string) {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("tidak mungkin");
  expect(r.code).toBe(code);
  return r;
}

describe("membuat akun", () => {
  it("membuat operator dengan sandi sementara yang bisa dipakai masuk dan wajib diganti", async () => {
    const admin = await makeUser("super_admin");
    const created = ok(await svc().create(admin.actor, { email: " Baru@Uninus.ac.id ", name: "[DUMMY] Operator Baru", role: "operator" }));
    expect(created.user.email).toBe("baru@uninus.ac.id");
    expect(created.user.roles).toEqual(["operator"]);
    expect(created.user.mustChangePassword).toBe(true);
    expect(created.temporaryPassword).toHaveLength(16);

    const auth = createAuthHandlers({ db: ctx.db, appUrl: "http://localhost:3000", secret: "x".repeat(40), env: {} });
    const res = await auth.login(
      new Request("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "baru@uninus.ac.id", password: created.temporaryPassword }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.mustChangePassword).toBe(true);
  });

  it("sandi sementara tidak pernah tersimpan polos atau masuk audit log", async () => {
    const admin = await makeUser("super_admin");
    const { temporaryPassword, user } = ok(await svc().create(admin.actor, { email: "x@uninus.ac.id", name: "[DUMMY] X", role: "operator" }));
    const [row] = await ctx.db.select().from(users).where(eq(users.id, user.id));
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(temporaryPassword);
    expect(JSON.stringify(await ctx.db.select().from(auditLogs))).not.toContain(temporaryPassword);
  });

  it("menolak email ganda (CONFLICT), email tidak valid, peran tak dikenal, dan field tambahan", async () => {
    const admin = await makeUser("super_admin");
    ok(await svc().create(admin.actor, { email: "a@uninus.ac.id", name: "[DUMMY] A", role: "operator" }));
    fails(await svc().create(admin.actor, { email: "A@uninus.ac.id", name: "[DUMMY] A2", role: "operator" }), "CONFLICT");
    fails(await svc().create(admin.actor, { email: "bukan-email", name: "[DUMMY] B", role: "operator" }), "VALIDATION_ERROR");
    fails(await svc().create(admin.actor, { email: "c@uninus.ac.id", name: "[DUMMY] C", role: "researcher" }), "VALIDATION_ERROR");
    fails(await svc().create(admin.actor, { email: "d@uninus.ac.id", name: "[DUMMY] D", role: "operator", isActive: false }), "VALIDATION_ERROR");
  });
});

describe("akses", () => {
  it("operator biasa tidak bisa melihat atau mengubah akun (404, tidak membocorkan)", async () => {
    const op = await makeUser("operator");
    const other = await makeUser("operator");
    fails(await svc().list(op.actor), "NOT_FOUND");
    fails(await svc().create(op.actor, { email: "z@uninus.ac.id", name: "[DUMMY] Z", role: "super_admin" }), "NOT_FOUND");
    fails(await svc().update(op.actor, other.u.id, { isActive: false }), "NOT_FOUND");
    fails(await svc().resetPassword(op.actor, other.u.id), "NOT_FOUND");
    expect(await ctx.db.select().from(users).where(eq(users.email, "z@uninus.ac.id"))).toHaveLength(0);
  });

  it("daftar memuat peran dan status tanpa memuat hash", async () => {
    const admin = await makeUser("super_admin");
    await makeUser("operator");
    const list = ok(await svc().list(admin.actor));
    expect(list).toHaveLength(2);
    expect(list.find((u) => u.id === admin.u.id)).toMatchObject({ roles: ["super_admin"], hasPassword: true, isActive: true });
    expect(JSON.stringify(list)).not.toContain("argon2");
  });
});

describe("nonaktifkan dan ubah peran", () => {
  it("menonaktifkan mencabut semua sesi seketika dan akun tidak bisa masuk lagi", async () => {
    const admin = await makeUser("super_admin");
    const op = await makeUser("operator");
    await createSession(ctx.db, op.u.id);
    await createSession(ctx.db, op.u.id);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, op.u.id))).toHaveLength(2);

    expect(ok(await svc().update(admin.actor, op.u.id, { isActive: false })).isActive).toBe(false);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, op.u.id))).toHaveLength(0);
    expect(ok(await svc().update(admin.actor, op.u.id, { isActive: true })).isActive).toBe(true);
  });

  it("mengganti peran mengganti izin dan mencabut sesi; hanya satu peran terkelola", async () => {
    const admin = await makeUser("super_admin");
    const op = await makeUser("operator");
    await createSession(ctx.db, op.u.id);
    const up = ok(await svc().update(admin.actor, op.u.id, { role: "super_admin" }));
    expect(up.roles).toEqual(["super_admin"]);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, op.u.id))).toHaveLength(0);
    expect(ok(await svc().update(admin.actor, op.u.id, { role: "operator" })).roles).toEqual(["operator"]);
  });

  it("tidak boleh mengubah akun sendiri, dan harus tersisa satu super admin aktif", async () => {
    const a = await makeUser("super_admin");
    const b = await makeUser("super_admin");
    fails(await svc().update(a.actor, a.u.id, { isActive: false }), "FORBIDDEN");
    fails(await svc().update(a.actor, a.u.id, { role: "operator" }), "FORBIDDEN");

    ok(await svc().update(a.actor, b.u.id, { isActive: false }));
    // b nonaktif: a satu-satunya yang aktif. Super admin lain (c) tidak bisa menurunkan a bila itu terakhir.
    const c = await makeUser("super_admin", { isActive: false });
    fails(await svc().update(c.actor, a.u.id, { role: "operator" }), "CONFLICT");
    fails(await svc().update(c.actor, a.u.id, { isActive: false }), "CONFLICT");
    expect(ok(await svc().list(a.actor)).find((u) => u.id === a.u.id)?.roles).toEqual(["super_admin"]);
  });

  it("perubahan kosong atau tidak dikenal ditolak; id bukan UUID 404", async () => {
    const admin = await makeUser("super_admin");
    const op = await makeUser("operator");
    fails(await svc().update(admin.actor, op.u.id, {}), "VALIDATION_ERROR");
    fails(await svc().update(admin.actor, op.u.id, { email: "baru@x.id" }), "VALIDATION_ERROR");
    fails(await svc().update(admin.actor, "bukan-uuid", { isActive: false }), "NOT_FOUND");
  });
});

describe("atur ulang kata sandi", () => {
  it("sandi lama mati, kunci dibuka, sesi dicabut, wajib ganti, dan audit tercatat", async () => {
    const admin = await makeUser("super_admin");
    const op = await makeUser("operator", { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 600_000) });
    await createSession(ctx.db, op.u.id);

    const { temporaryPassword } = ok(await svc().resetPassword(admin.actor, op.u.id));
    const [row] = await ctx.db.select().from(users).where(eq(users.id, op.u.id));
    expect(row.mustChangePassword).toBe(true);
    expect(row.failedLoginCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, op.u.id))).toHaveLength(0);

    const auth = createAuthHandlers({ db: ctx.db, appUrl: "http://localhost:3000", secret: "x".repeat(40), env: {} });
    const attempt = (password: string) =>
      auth.login(
        new Request("http://localhost:3000/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ email: op.u.email, password }),
        }),
      );
    expect((await attempt("kata-sandi-awal-123")).status).toBe(401);
    expect((await attempt(temporaryPassword)).status).toBe(200);
    expect(await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "user.password_reset"))).toHaveLength(1);
    expect(JSON.stringify(await ctx.db.select().from(auditLogs))).not.toContain(temporaryPassword);
  });

  it("tidak untuk akun sendiri, dan 404 untuk id yang tidak ada", async () => {
    const admin = await makeUser("super_admin");
    fails(await svc().resetPassword(admin.actor, admin.u.id), "FORBIDDEN");
    fails(await svc().resetPassword(admin.actor, crypto.randomUUID()), "NOT_FOUND");
  });
});
