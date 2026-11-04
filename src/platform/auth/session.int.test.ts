import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedRbac } from "@/platform/db/seed/rbac";
import { auditLogs, sessions, userRoles, users } from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createAuthHandlers } from "./handlers";
import { createSession, findSession, revokeUserSessions } from "./session-store";
import { hashSessionToken } from "./session-token";

const APP_URL = "http://localhost:3000";
const SECRET = "x".repeat(40);
const DEV_ENV = { DEV_LOGIN: "1", APP_ENV: "development", NODE_ENV: "test" };

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

const handlers = (env: Record<string, string | undefined> = DEV_ENV) =>
  createAuthHandlers({ db: ctx.db, appUrl: APP_URL, secret: SECRET, env });

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_URL, ...headers },
    body: JSON.stringify(body),
  });
}

function get(path: string, cookie?: string, headers: Record<string, string> = {}) {
  return new Request(`${APP_URL}${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
}

/** Login dev lalu kembalikan header Cookie siap pakai. */
async function loginAs(role: "researcher" | "operator" | "super_admin", email = "dosen@uninus.ac.id") {
  const res = await handlers().devLogin(post("/api/v1/auth/dev-login", { email, role }));
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { cookie: setCookie.split(";")[0], setCookie, body: await res.json() };
}

async function newUser(isActive = true) {
  const [u] = await ctx.db
    .insert(users)
    .values({ ssoSubject: `sub-${Math.random()}`, email: `u${Math.random()}@uninus.ac.id`, name: "[DUMMY]", isActive })
    .returning();
  return u;
}

describe("penyimpanan sesi", () => {
  it("hanya hash token yang tersimpan, bukan token mentah", async () => {
    const u = await newUser();
    const { token } = await createSession(ctx.db, u.id);
    const [row] = await ctx.db.select().from(sessions).where(eq(sessions.userId, u.id));
    expect(row.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("token tidak dikenal, kedaluwarsa absolut, atau idle ditolak", async () => {
    const u = await newUser();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = await createSession(ctx.db, u.id, {}, t0);

    expect(await findSession(ctx.db, "tidak-dikenal-tidak-dikenal-tidak", t0)).toBeNull();
    expect(await findSession(ctx.db, token, new Date(t0.getTime() + 30 * 60_000))).not.toBeNull();
    // Akses pada menit ke-30 memperpanjang idle sampai menit ke-90, jadi menit ke-95 sudah lewat.
    expect(await findSession(ctx.db, token, new Date(t0.getTime() + 95 * 60_000))).toBeNull();
  });

  it("batas absolut 8 jam tidak bisa dilewati walau terus aktif", async () => {
    const u = await newUser();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = await createSession(ctx.db, u.id, {}, t0);
    for (let m = 30; m <= 450; m += 30) {
      expect(await findSession(ctx.db, token, new Date(t0.getTime() + m * 60_000))).not.toBeNull();
    }
    expect(await findSession(ctx.db, token, new Date(t0.getTime() + 8 * 3600_000 + 1000))).toBeNull();
  });

  it("akun nonaktif atau terhapus ditolak walau sesi masih berlaku", async () => {
    const aktif = await newUser();
    const { token } = await createSession(ctx.db, aktif.id);
    expect(await findSession(ctx.db, token)).not.toBeNull();

    await ctx.db.update(users).set({ isActive: false }).where(eq(users.id, aktif.id));
    expect(await findSession(ctx.db, token)).toBeNull();

    await ctx.db.update(users).set({ isActive: true, deletedAt: new Date() }).where(eq(users.id, aktif.id));
    expect(await findSession(ctx.db, token)).toBeNull();
  });

  it("revokeUserSessions mencabut semua sesi pengguna", async () => {
    const u = await newUser();
    const a = await createSession(ctx.db, u.id);
    const b = await createSession(ctx.db, u.id);
    await revokeUserSessions(ctx.db, u.id);
    expect(await findSession(ctx.db, a.token)).toBeNull();
    expect(await findSession(ctx.db, b.token)).toBeNull();
  });
});

describe("alur login pengembangan", () => {
  it("login -> me -> logout, dengan cookie aman dan audit log", async () => {
    const { cookie, setCookie, body } = await loginAs("researcher");
    expect(body.data).toMatchObject({ email: "dosen@uninus.ac.id", role: "researcher" });
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const me = await handlers().me(get("/api/v1/auth/me", cookie));
    expect(me.status).toBe(200);
    const meBody = await me.json();
    expect(meBody.data.roles).toEqual(["researcher"]);
    expect(meBody.data.permissions).toContain("innovation.create");
    expect(meBody.data.permissions).not.toContain("innovation.review");

    const csrf = (await (await handlers().csrf(get("/api/v1/auth/csrf", cookie))).json()).data.token;
    const out = await handlers().logout(post("/api/v1/auth/logout", {}, { cookie, "x-csrf-token": csrf }));
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");

    expect((await handlers().me(get("/api/v1/auth/me", cookie))).status).toBe(401);

    const actions = (await ctx.db.select({ a: auditLogs.action }).from(auditLogs)).map((r) => r.a).sort();
    expect(actions).toEqual(["auth.login", "auth.logout"]);
  });

  it("permission gabungan sesuai role: operator punya review, researcher tidak", async () => {
    const op = await loginAs("operator", "op@uninus.ac.id");
    const body = await (await handlers().me(get("/api/v1/auth/me", op.cookie))).json();
    expect(body.data.permissions).toContain("innovation.review");
    expect(body.data.permissions).not.toContain("user.manage");

    const sa = await loginAs("super_admin", "sa@uninus.ac.id");
    const saBody = await (await handlers().me(get("/api/v1/auth/me", sa.cookie))).json();
    expect(saBody.data.permissions).toContain("audit.read");
  });

  it("tanpa cookie atau cookie palsu: 401", async () => {
    expect((await handlers().me(get("/api/v1/auth/me"))).status).toBe(401);
    const palsu = "inovasi_session=" + "z".repeat(43);
    expect((await handlers().me(get("/api/v1/auth/me", palsu))).status).toBe(401);
    expect((await handlers().csrf(get("/api/v1/auth/csrf"))).status).toBe(401);
  });

  it("login ulang merotasi sesi: token lama tidak berlaku lagi", async () => {
    const first = await loginAs("researcher");
    const res = await handlers().devLogin(
      post("/api/v1/auth/dev-login", { email: "dosen@uninus.ac.id", role: "researcher" }, { cookie: first.cookie }),
    );
    expect(res.status).toBe(200);
    expect((await handlers().me(get("/api/v1/auth/me", first.cookie))).status).toBe(401);
    expect((await ctx.db.select().from(sessions)).length).toBe(1);
  });

  it("pengguna dev yang sama tidak menggandakan akun atau role", async () => {
    await loginAs("researcher");
    await loginAs("researcher");
    expect((await ctx.db.select().from(users)).length).toBe(1);
    expect((await ctx.db.select().from(userRoles)).length).toBe(1);
  });
});

describe("keamanan logout dan login dev", () => {
  it("logout tanpa Origin yang benar ditolak, sesi tetap hidup", async () => {
    const { cookie } = await loginAs("researcher");
    const csrf = (await (await handlers().csrf(get("/api/v1/auth/csrf", cookie))).json()).data.token;

    const noOrigin = new Request(`${APP_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect((await handlers().logout(noOrigin)).status).toBe(403);

    const asing = post("/api/v1/auth/logout", {}, { cookie, "x-csrf-token": csrf, origin: "https://jahat.example" });
    expect((await handlers().logout(asing)).status).toBe(403);

    expect((await handlers().me(get("/api/v1/auth/me", cookie))).status).toBe(200);
  });

  it("logout dengan sesi tetapi tanpa/salah token CSRF ditolak", async () => {
    const { cookie } = await loginAs("researcher");
    expect((await handlers().logout(post("/api/v1/auth/logout", {}, { cookie }))).status).toBe(403);
    const salah = post("/api/v1/auth/logout", {}, { cookie, "x-csrf-token": "salah" });
    expect((await handlers().logout(salah)).status).toBe(403);
    expect((await handlers().me(get("/api/v1/auth/me", cookie))).status).toBe(200);
  });

  it("token CSRF milik sesi lain tidak berlaku", async () => {
    const a = await loginAs("researcher", "a@uninus.ac.id");
    const b = await loginAs("researcher", "b@uninus.ac.id");
    const csrfA = (await (await handlers().csrf(get("/api/v1/auth/csrf", a.cookie))).json()).data.token;
    const res = await handlers().logout(post("/api/v1/auth/logout", {}, { cookie: b.cookie, "x-csrf-token": csrfA }));
    expect(res.status).toBe(403);
  });

  it("logout tanpa sesi berhasil dan membersihkan cookie (idempoten)", async () => {
    const res = await handlers().logout(post("/api/v1/auth/logout", {}));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("dev-login mati: 404 dan tidak membuat apa pun", async () => {
    for (const env of [{}, { ...DEV_ENV, DEV_LOGIN: undefined }, { ...DEV_ENV, APP_ENV: "production" }, { ...DEV_ENV, NODE_ENV: "production" }]) {
      const res = await handlers(env).devLogin(post("/api/v1/auth/dev-login", { email: "x@uninus.ac.id", role: "super_admin" }));
      expect(res.status).toBe(404);
    }
    expect((await ctx.db.select().from(users)).length).toBe(0);
    expect((await ctx.db.select().from(sessions)).length).toBe(0);
  });

  it("dev-login menolak Origin asing, JSON rusak, role tak dikenal, dan field tambahan", async () => {
    const h = handlers();
    expect((await h.devLogin(post("/x", { email: "x@uninus.ac.id", role: "researcher" }, { origin: "https://jahat.example" }))).status).toBe(403);

    const rusak = new Request(`${APP_URL}/x`, { method: "POST", headers: { origin: APP_URL }, body: "{bukan json" });
    expect((await h.devLogin(rusak)).status).toBe(400);

    for (const body of [
      { email: "x@uninus.ac.id", role: "root" },
      { email: "bukan-email", role: "researcher" },
      { email: "x@uninus.ac.id", role: "researcher", isAdmin: true },
      {},
    ]) {
      expect((await h.devLogin(post("/x", body))).status).toBe(400);
    }
    expect((await ctx.db.select().from(users)).length).toBe(0);
  });

  it("pengguna nonaktif tidak bisa memakai sesi lama", async () => {
    const { cookie, body } = await loginAs("researcher");
    await ctx.db.update(users).set({ isActive: false }).where(eq(users.id, body.data.id));
    expect((await handlers().me(get("/api/v1/auth/me", cookie))).status).toBe(401);
  });
});
