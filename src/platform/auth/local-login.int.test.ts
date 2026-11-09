import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedRbac } from "@/platform/db/seed/rbac";
import { auditLogs, roles, sessions, userRoles, users } from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createRateLimiter } from "@/platform/http/rate-limit";
import { createAuthHandlers } from "./handlers";
import { hashPassword } from "./password";

const APP_URL = "http://localhost:3000";
const SECRET = "x".repeat(40);
const GOOD = "kata-sandi-yang-kuat-123";

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

const handlers = (extra: Partial<Parameters<typeof createAuthHandlers>[0]> = {}) =>
  createAuthHandlers({ db: ctx.db, appUrl: APP_URL, secret: SECRET, env: { NODE_ENV: "test" }, ...extra });

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: JSON.stringify(body),
  });
}

function get(path: string, cookie?: string) {
  return new Request(`${APP_URL}${path}`, { headers: cookie ? { cookie } : {} });
}

async function makeUser(
  over: Partial<typeof users.$inferInsert> & { role?: "operator" | "super_admin"; password?: string | null } = {},
) {
  const { role = "operator", password = GOOD, ...rest } = over;
  const [u] = await ctx.db
    .insert(users)
    .values({
      email: `op${Math.random().toString(36).slice(2, 8)}@uninus.ac.id`,
      name: "[DUMMY] Operator",
      passwordHash: password === null ? null : await hashPassword(password),
      ...rest,
    })
    .returning();
  const [r] = await ctx.db.select().from(roles).where(eq(roles.code, role));
  await ctx.db.insert(userRoles).values({ userId: u.id, roleId: r.id });
  return u;
}

async function login(email: string, password: string, h = handlers()) {
  const res = await h.login(post("/api/v1/auth/login", { email, password }));
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  return { res, cookie, body: await res.clone().json() };
}

async function csrfFor(cookie: string, h = handlers()) {
  return (await (await h.csrf(get("/api/v1/auth/csrf", cookie))).json()).data.token as string;
}

describe("login berhasil", () => {
  it("memberi cookie aman, sesi berfungsi, audit mencatat metode, hitungan gagal di-reset", async () => {
    const u = await makeUser({ failedLoginCount: 3 });
    const { res, cookie, body } = await login(u.email.toUpperCase(), GOOD);
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: u.id, mustChangePassword: false });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const me = await (await handlers().me(get("/api/v1/auth/me", cookie))).json();
    expect(me.data.email).toBe(u.email);
    expect(me.data.permissions).toContain("innovation.publish");

    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    expect(row.failedLoginCount).toBe(0);
    expect(row.lastLoginAt).not.toBeNull();
    const [audit] = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "auth.login"));
    expect(audit.changes).toEqual({ method: "password" });
  });

  it("login ulang merotasi sesi: cookie lama tidak berlaku lagi", async () => {
    const u = await makeUser();
    const first = await login(u.email, GOOD);
    const second = await handlers().login(
      new Request(`${APP_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL, cookie: first.cookie },
        body: JSON.stringify({ email: u.email, password: GOOD }),
      }),
    );
    expect(second.status).toBe(200);
    expect((await handlers().me(get("/api/v1/auth/me", first.cookie))).status).toBe(401);
  });

  it("hash tersimpan berformat argon2id dan tidak pernah muncul di respons atau audit log", async () => {
    const u = await makeUser();
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    const { body } = await login(u.email, GOOD);
    expect(JSON.stringify(body)).not.toContain("argon2");
    expect(JSON.stringify(await ctx.db.select().from(auditLogs))).not.toContain(GOOD);
  });
});

describe("semua kegagalan terlihat sama", () => {
  it("email tidak ada, sandi salah, nonaktif, tanpa sandi, terkunci: status dan isi respons identik", async () => {
    const wrong = await makeUser();
    const inactive = await makeUser({ isActive: false });
    const noPassword = await makeUser({ password: null });
    const locked = await makeUser({ lockedUntil: new Date(Date.now() + 10 * 60_000) });

    const attempts = [
      await login("tidak-ada@uninus.ac.id", GOOD),
      await login(wrong.email, "sandi-yang-salah-sekali"),
      await login(inactive.email, GOOD),
      await login(noPassword.email, GOOD),
      await login(locked.email, GOOD),
    ];
    for (const a of attempts) {
      expect(a.res.status).toBe(401);
      expect(a.res.headers.get("set-cookie")).toBeNull();
    }
    const bodies = new Set(attempts.map((a) => JSON.stringify(a.body)));
    expect(bodies.size).toBe(1);
  });

  it("alasan sebenarnya hanya ada di audit log", async () => {
    const wrong = await makeUser();
    await login("tidak-ada@uninus.ac.id", GOOD);
    await login(wrong.email, "sandi-yang-salah-sekali");
    const reasons = (await ctx.db.select().from(auditLogs)).map((a) => (a.changes as { reason?: string } | null)?.reason).sort();
    expect(reasons).toEqual(["unknown_or_no_password", "wrong_password"]);
  });
});

describe("penguncian akun", () => {
  it("terkunci setelah 5 gagal beruntun, sandi benar pun ditolak selama terkunci", async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i++) expect((await login(u.email, "salah-salah-salah-1")).res.status).toBe(401);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    expect(row.lockedUntil).not.toBeNull();
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect((await login(u.email, GOOD)).res.status).toBe(401);
    const locks = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "auth.account_locked"));
    expect(locks).toHaveLength(1);
  });

  it("kegagalan tidak beruntun tidak mengunci: sukses di tengah mengulang hitungan", async () => {
    const u = await makeUser();
    for (let i = 0; i < 4; i++) await login(u.email, "salah-salah-salah-1");
    expect((await login(u.email, GOOD)).res.status).toBe(200);
    for (let i = 0; i < 4; i++) await login(u.email, "salah-salah-salah-1");
    expect((await login(u.email, GOOD)).res.status).toBe(200);
  });

  it("setelah masa kunci lewat bisa masuk, dan salah ketik pertama tidak langsung mengunci lagi", async () => {
    const locked = await makeUser({ failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) });
    expect((await login(locked.email, GOOD)).res.status).toBe(200);

    const again = await makeUser({ failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) });
    expect((await login(again.email, "salah-salah-salah-1")).res.status).toBe(401);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, again.id));
    expect(row.failedLoginCount).toBe(1);
    expect(row.lockedUntil).toBeNull();
  });

  it("percobaan serentak tetap dihitung atomik", async () => {
    const u = await makeUser();
    await Promise.all(Array.from({ length: 5 }, () => login(u.email, "salah-salah-salah-1")));
    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    expect(row.failedLoginCount).toBe(5);
    expect(row.lockedUntil).not.toBeNull();
  });
});

describe("masukan dan pembatas laju", () => {
  it("menolak Origin asing, JSON rusak, field tambahan, dan isian kosong, tanpa menyentuh akun", async () => {
    const u = await makeUser();
    const h = handlers();
    expect((await h.login(post("/api/v1/auth/login", { email: u.email, password: GOOD }, { origin: "https://jahat.example" }))).status).toBe(403);
    expect((await h.login(new Request(`${APP_URL}/api/v1/auth/login`, { method: "POST", headers: { origin: APP_URL }, body: "{rusak" }))).status).toBe(400);
    expect((await h.login(post("/api/v1/auth/login", { email: u.email, password: GOOD, role: "super_admin" }))).status).toBe(400);
    expect((await h.login(post("/api/v1/auth/login", { email: "", password: "" }))).status).toBe(400);
    expect(await ctx.db.select().from(sessions)).toHaveLength(0);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    expect(row.failedLoginCount).toBe(0);
  });

  it("melewati batas per email dijawab 429, email lain tidak terpengaruh", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const h = handlers({
      loginLimiters: {
        global: createRateLimiter({ limit: 100, windowMs: 60_000 }),
        perEmail: createRateLimiter({ limit: 3, windowMs: 60_000 }),
      },
    });
    for (let i = 0; i < 3; i++) expect((await login(a.email, "salah-salah-salah-1", h)).res.status).toBe(401);
    expect((await login(a.email, GOOD, h)).res.status).toBe(429);
    expect((await login(b.email, GOOD, h)).res.status).toBe(200);
  });

  it("batas global melindungi server dari banjir percobaan", async () => {
    const h = handlers({
      loginLimiters: {
        global: createRateLimiter({ limit: 2, windowMs: 60_000 }),
        perEmail: createRateLimiter({ limit: 100, windowMs: 60_000 }),
      },
    });
    await login("a@uninus.ac.id", GOOD, h);
    await login("b@uninus.ac.id", GOOD, h);
    expect((await login("c@uninus.ac.id", GOOD, h)).res.status).toBe(429);
  });
});

describe("ganti kata sandi", () => {
  it("akun bersandi sementara hanya boleh ganti sandi; rute lain ditolak sampai selesai", async () => {
    const u = await makeUser({ mustChangePassword: true, role: "super_admin" });
    const { cookie, body } = await login(u.email, GOOD);
    expect(body.data.mustChangePassword).toBe(true);
    const h = handlers();

    const blocked = await h.authenticate(get("/api/v1/admin/innovations", cookie), { permission: "innovation.read_any" });
    expect("response" in blocked).toBe(true);
    if ("response" in blocked) {
      const b = await blocked.response.json();
      expect(b.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    }
    expect((await h.me(get("/api/v1/auth/me", cookie))).status).toBe(200);

    const csrf = await csrfFor(cookie);
    const change = await h.changePassword(
      post("/api/v1/auth/password", { currentPassword: GOOD, newPassword: "sandi-baru-yang-kuat-456" }, { cookie, "x-csrf-token": csrf }),
    );
    expect(change.status).toBe(200);

    const allowed = await h.authenticate(get("/api/v1/admin/innovations", cookie), { permission: "innovation.read_any" });
    expect("session" in allowed).toBe(true);
    expect((await login(u.email, GOOD)).res.status).toBe(401);
    expect((await login(u.email, "sandi-baru-yang-kuat-456")).res.status).toBe(200);
  });

  it("mencabut sesi lain tetapi mempertahankan sesi yang dipakai", async () => {
    const u = await makeUser();
    const here = await login(u.email, GOOD);
    const other = await login(u.email, GOOD);
    const csrf = await csrfFor(here.cookie);
    const res = await handlers().changePassword(
      post("/api/v1/auth/password", { currentPassword: GOOD, newPassword: "sandi-baru-yang-kuat-456" }, { cookie: here.cookie, "x-csrf-token": csrf }),
    );
    expect(res.status).toBe(200);
    expect((await handlers().me(get("/api/v1/auth/me", here.cookie))).status).toBe(200);
    expect((await handlers().me(get("/api/v1/auth/me", other.cookie))).status).toBe(401);
    const audit = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "auth.password_changed"));
    expect(JSON.stringify(audit)).not.toContain("sandi-baru");
  });

  it("menolak: sandi lama salah (dihitung seperti gagal login), sandi lemah, sandi sama, tanpa CSRF", async () => {
    const u = await makeUser();
    const { cookie } = await login(u.email, GOOD);
    const csrf = await csrfFor(cookie);
    const h = handlers();
    const call = (body: object, token: string | null = csrf) =>
      h.changePassword(post("/api/v1/auth/password", body, { cookie, ...(token ? { "x-csrf-token": token } : {}) }));

    const wrong = await call({ currentPassword: "bukan-sandi-saya-1", newPassword: "sandi-baru-yang-kuat-456" });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error.details[0].field).toBe("currentPassword");
    const [afterWrong] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    expect(afterWrong.failedLoginCount).toBe(1);

    const weak = await call({ currentPassword: GOOD, newPassword: "pendek" });
    expect((await weak.json()).error.details[0].field).toBe("newPassword");
    expect((await call({ currentPassword: GOOD, newPassword: GOOD })).status).toBe(400);
    expect((await call({ currentPassword: GOOD, newPassword: "sandi-baru-yang-kuat-456" }, null)).status).toBe(403);
    expect((await login(u.email, GOOD)).res.status).toBe(200);
  });
});
