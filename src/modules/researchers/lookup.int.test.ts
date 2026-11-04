import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthHandlers } from "@/platform/auth/handlers";
import { faculties, researchers } from "@/platform/db/schema";
import { seedRbac } from "@/platform/db/seed/rbac";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createResearcherLookup, createResearcherLookupHandler } from "./lookup";

const APP_URL = "http://localhost:3000";
const DEV_ENV = { DEV_LOGIN: "1", APP_ENV: "development", NODE_ENV: "test" };

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
let auth: ReturnType<typeof createAuthHandlers>;
let handle: ReturnType<typeof createResearcherLookupHandler>;
const lookup = () => createResearcherLookup(ctx.db);

beforeAll(async () => {
  ctx = await setupTestDb();
  auth = createAuthHandlers({ db: ctx.db, appUrl: APP_URL, secret: "x".repeat(40), env: DEV_ENV });
  handle = createResearcherLookupHandler({ auth, lookup: lookup() });
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
  await seedRbac(ctx.db);
});

async function add(slug: string, fullName: string, over: Partial<typeof researchers.$inferInsert> = {}) {
  const [r] = await ctx.db.insert(researchers).values({ slug, fullName, ...over }).returning();
  return r;
}

describe("pencarian peneliti untuk pemilih tim", () => {
  it("hanya profil publik dan tidak terhapus; tanpa NIDN/NIP", async () => {
    const [fac] = await ctx.db.insert(faculties).values({ slug: "f", name: "[DUMMY] Fakultas" }).returning();
    await add("a", "[DUMMY] Siti Aminah", { identifier: "0412345678", facultyId: fac.id });
    await add("b", "[DUMMY] Siti Privat", { isPublic: false });
    await add("c", "[DUMMY] Siti Terhapus", { deletedAt: new Date() });

    const hasil = await lookup().search("siti");
    expect(hasil.map((r) => r.fullName)).toEqual(["[DUMMY] Siti Aminah"]);
    expect(hasil[0].facultyName).toBe("[DUMMY] Fakultas");
    expect(JSON.stringify(hasil)).not.toContain("0412345678");
  });

  it("kata kunci pendek tidak mengembalikan apa pun; % dan _ bukan wildcard; hasil dibatasi 10", async () => {
    for (let i = 0; i < 15; i++) await add(`p${i}`, `[DUMMY] Peneliti ${String(i).padStart(2, "0")}`);
    expect(await lookup().search("")).toEqual([]);
    expect(await lookup().search("a")).toEqual([]);
    expect(await lookup().search("%%")).toEqual([]);
    expect(await lookup().search("__")).toEqual([]);
    expect(await lookup().search("peneliti")).toHaveLength(10);
  });

  it("byUserId mengembalikan profil milik pengguna, atau null bila belum ada/terhapus", async () => {
    const { users } = await import("@/platform/db/schema");
    const [u1] = await ctx.db.insert(users).values({ ssoSubject: "s1", email: "a@uninus.ac.id", name: "[DUMMY]" }).returning();
    const [u2] = await ctx.db.insert(users).values({ ssoSubject: "s2", email: "b@uninus.ac.id", name: "[DUMMY]" }).returning();
    const [u3] = await ctx.db.insert(users).values({ ssoSubject: "s3", email: "c@uninus.ac.id", name: "[DUMMY]" }).returning();
    const own = await add("a", "[DUMMY] Profil A", { userId: u1.id, isPublic: false });
    await add("c", "[DUMMY] Profil C", { userId: u3.id, deletedAt: new Date() });

    expect((await lookup().byUserId(u1.id))?.id).toBe(own.id);
    expect(await lookup().byUserId(u2.id)).toBeNull();
    expect(await lookup().byUserId(u3.id)).toBeNull();
  });

  it("byIds mengembalikan nama, termasuk profil non-publik yang sudah tersimpan di tim", async () => {
    const privat = await add("x", "[DUMMY] Anggota Privat", { isPublic: false });
    const hapus = await add("y", "[DUMMY] Terhapus", { deletedAt: new Date() });
    const hasil = await lookup().byIds([privat.id, hapus.id]);
    expect(hasil.map((r) => r.id)).toEqual([privat.id]);
    expect(await lookup().byIds([])).toEqual([]);
  });
});

describe("rute pemilih tim", () => {
  async function login(role: "researcher" | "operator") {
    const res = await auth.devLogin(
      new Request(`${APP_URL}/api/v1/auth/dev-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: JSON.stringify({ email: `${role}@uninus.ac.id`, role }),
      }),
    );
    return (res.headers.get("set-cookie") ?? "").split(";")[0];
  }

  it("401 tanpa login; 200 dengan login; kata kunci terlalu panjang 400", async () => {
    await add("a", "[DUMMY] Siti Aminah");
    const url = `${APP_URL}/api/v1/me/researchers?q=siti`;
    expect((await handle(new Request(url))).status).toBe(401);

    const cookie = await login("researcher");
    const res = await handle(new Request(url, { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);

    const panjang = `${APP_URL}/api/v1/me/researchers?q=${"a".repeat(101)}`;
    expect((await handle(new Request(panjang, { headers: { cookie } }))).status).toBe(400);
  });
});
