import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthHandlers } from "@/platform/auth/handlers";
import { seedRbac } from "@/platform/db/seed/rbac";
import { auditLogs, sessions, userRoles, users } from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createSession } from "@/platform/auth/session-store";
import { createSuperAdmin } from "./bootstrap";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;

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

const PASSWORD = "pilihan-sandi-saya-2026";

async function canLogin(email: string, password: string) {
  const auth = createAuthHandlers({ db: ctx.db, appUrl: "http://localhost:3000", secret: "x".repeat(40), env: {} });
  const res = await auth.login(
    new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    }),
  );
  return res.status === 200;
}

describe("createSuperAdmin (perintah CLI)", () => {
  it("membuat super admin yang bisa masuk dan langsung punya hak penuh, tanpa wajib ganti sandi", async () => {
    const res = await createSuperAdmin(ctx.db, { email: " Admin@Uninus.ac.id ", name: "[DUMMY] Admin", password: PASSWORD });
    expect(res).toMatchObject({ ok: true, created: true });
    const [row] = await ctx.db.select().from(users).where(eq(users.email, "admin@uninus.ac.id"));
    expect(row.mustChangePassword).toBe(false);
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await ctx.db.select().from(userRoles).where(eq(userRoles.userId, row.id))).toHaveLength(1);
    expect(await canLogin("admin@uninus.ac.id", PASSWORD)).toBe(true);
    const audit = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "user.create_cli"));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(PASSWORD);
  });

  it("mode sementara: akun wajib ganti sandi saat masuk, mode biasa tidak", async () => {
    await createSuperAdmin(ctx.db, { email: "tmp@uninus.ac.id", name: "[DUMMY] Tmp", password: PASSWORD, temporary: true });
    await createSuperAdmin(ctx.db, { email: "biasa@uninus.ac.id", name: "[DUMMY] Biasa", password: PASSWORD });
    const [tmp] = await ctx.db.select().from(users).where(eq(users.email, "tmp@uninus.ac.id"));
    const [normal] = await ctx.db.select().from(users).where(eq(users.email, "biasa@uninus.ac.id"));
    expect([tmp.mustChangePassword, normal.mustChangePassword]).toEqual([true, false]);
    // --reset dengan --temporary juga memaksa ganti sandi.
    await createSuperAdmin(ctx.db, { email: "biasa@uninus.ac.id", name: "[DUMMY] Biasa", password: "sandi-lain-yang-kuat-9", reset: true, temporary: true });
    const [after] = await ctx.db.select().from(users).where(eq(users.email, "biasa@uninus.ac.id"));
    expect(after.mustChangePassword).toBe(true);
  });

  it("menolak email yang sudah ada kecuali --reset; reset mengganti sandi, membuka kunci, mencabut sesi", async () => {
    await createSuperAdmin(ctx.db, { email: "admin@uninus.ac.id", name: "[DUMMY] Admin", password: PASSWORD });
    const again = await createSuperAdmin(ctx.db, { email: "admin@uninus.ac.id", name: "[DUMMY] Admin", password: "sandi-lain-yang-kuat-9" });
    expect(again).toMatchObject({ ok: false });
    expect(await canLogin("admin@uninus.ac.id", PASSWORD)).toBe(true);

    const [row] = await ctx.db.select().from(users).where(eq(users.email, "admin@uninus.ac.id"));
    await ctx.db.update(users).set({ failedLoginCount: 5, lockedUntil: new Date(Date.now() + 600_000) }).where(eq(users.id, row.id));
    await createSession(ctx.db, row.id);

    const reset = await createSuperAdmin(ctx.db, { email: "admin@uninus.ac.id", name: "[DUMMY] Admin", password: "sandi-lain-yang-kuat-9", reset: true });
    expect(reset).toMatchObject({ ok: true, created: false });
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, row.id))).toHaveLength(0);
    expect(await canLogin("admin@uninus.ac.id", PASSWORD)).toBe(false);
    expect(await canLogin("admin@uninus.ac.id", "sandi-lain-yang-kuat-9")).toBe(true);
    expect(await ctx.db.select().from(userRoles).where(eq(userRoles.userId, row.id))).toHaveLength(1);
  });

  it("menolak sandi lemah, email/nama tidak valid, dan role yang belum di-seed, tanpa menulis apa pun", async () => {
    expect(await createSuperAdmin(ctx.db, { email: "admin@uninus.ac.id", name: "[DUMMY] A", password: "pendek" })).toMatchObject({ ok: false });
    expect(await createSuperAdmin(ctx.db, { email: "bukan-email", name: "[DUMMY] A", password: PASSWORD })).toMatchObject({ ok: false });
    expect(await createSuperAdmin(ctx.db, { email: "admin@uninus.ac.id", name: "x", password: PASSWORD })).toMatchObject({ ok: false });
    expect(await ctx.db.select().from(users)).toHaveLength(0);

    await resetTestDb(ctx.db);
    const res = await createSuperAdmin(ctx.db, { email: "admin@uninus.ac.id", name: "[DUMMY] A", password: PASSWORD });
    expect(res).toMatchObject({ ok: false });
    expect(await ctx.db.select().from(users)).toHaveLength(0);
  });
});
