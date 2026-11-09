import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthHandlers } from "@/platform/auth/handlers";
import { categories, innovations } from "@/platform/db/schema";
import { seedRbac } from "@/platform/db/seed/rbac";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createInnovationHandlers } from "./handlers";
import { createInnovationService } from "./service";

// Menguji alur pengajuan dosen lama, yang hanya hidup di balik flag (ADR-008, D-20).
process.env.RESEARCHER_PORTAL = "1";

const APP_URL = "http://localhost:3000";
const SECRET = "x".repeat(40);
const DEV_ENV = { DEV_LOGIN: "1", APP_ENV: "development", NODE_ENV: "test" };
const BASE = `${APP_URL}/api/v1/me/innovations`;

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
let auth: ReturnType<typeof createAuthHandlers>;
let api: ReturnType<typeof createInnovationHandlers>;

beforeAll(async () => {
  ctx = await setupTestDb();
  auth = createAuthHandlers({ db: ctx.db, appUrl: APP_URL, secret: SECRET, env: DEV_ENV });
  api = createInnovationHandlers({ auth, service: createInnovationService(ctx.db) });
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
  await seedRbac(ctx.db);
});

interface Client {
  cookie: string;
  csrf: string;
}

async function login(email: string, role: "researcher" | "operator" = "researcher"): Promise<Client> {
  const res = await auth.devLogin(
    new Request(`${APP_URL}/api/v1/auth/dev-login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_URL },
      body: JSON.stringify({ email, role }),
    }),
  );
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  const csrfRes = await auth.csrf(new Request(`${APP_URL}/api/v1/auth/csrf`, { headers: { cookie } }));
  return { cookie, csrf: (await csrfRes.json()).data.token };
}

function req(method: string, url: string, client?: Client, body?: unknown, extra: Record<string, string> = {}) {
  const mutating = method !== "GET";
  return new Request(url, {
    method,
    headers: {
      ...(client ? { cookie: client.cookie } : {}),
      ...(mutating ? { origin: APP_URL } : {}),
      ...(mutating && client ? { "x-csrf-token": client.csrf } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...extra,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const valid = (over: Record<string, unknown> = {}) => ({
  title: "[DUMMY] Alat Penyaring Air Sederhana",
  summary: "[DUMMY] Ringkasan inovasi yang cukup panjang untuk lolos validasi.",
  ...over,
});

async function category() {
  const [c] = await ctx.db.insert(categories).values({ slug: "k1", name: "[DUMMY] Kategori" }).returning();
  return c.id;
}

describe("gerbang akses rute /me/innovations", () => {
  it("tanpa login: semua rute 401", async () => {
    const id = "01a1a48e-b38f-71da-829f-b542da9161af";
    const calls = [
      api.list(req("GET", BASE)),
      api.create(req("POST", BASE, undefined, valid())),
      api.get(req("GET", `${BASE}/${id}`), id),
      api.patch(req("PATCH", `${BASE}/${id}`, undefined, {}), id),
      api.remove(req("DELETE", `${BASE}/${id}`), id),
      api.submit(req("POST", `${BASE}/${id}/submit`), id),
      api.withdraw(req("POST", `${BASE}/${id}/withdraw`), id),
      api.history(req("GET", `${BASE}/${id}/history`), id),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it("metode pengubah data ditolak 403 tanpa Origin, Origin asing, atau token CSRF yang benar", async () => {
    const me = await login("a@uninus.ac.id");
    const body = JSON.stringify(valid());
    const headers = { cookie: me.cookie, "content-type": "application/json" };

    const noOrigin = new Request(BASE, { method: "POST", headers: { ...headers, "x-csrf-token": me.csrf }, body });
    const foreign = new Request(BASE, { method: "POST", headers: { ...headers, "x-csrf-token": me.csrf, origin: "https://jahat.example" }, body });
    const noCsrf = new Request(BASE, { method: "POST", headers: { ...headers, origin: APP_URL }, body });
    const badCsrf = new Request(BASE, { method: "POST", headers: { ...headers, origin: APP_URL, "x-csrf-token": "palsu" }, body });
    for (const r of [noOrigin, foreign, noCsrf, badCsrf]) expect((await api.create(r)).status).toBe(403);
    expect(await ctx.db.select().from(innovations)).toHaveLength(0);
  });

  it("body: bukan JSON 415, JSON rusak 400, terlalu besar 413", async () => {
    const me = await login("a@uninus.ac.id");
    const base = { cookie: me.cookie, origin: APP_URL, "x-csrf-token": me.csrf };

    const teks = new Request(BASE, { method: "POST", headers: { ...base, "content-type": "text/plain" }, body: "halo" });
    expect((await api.create(teks)).status).toBe(415);

    const rusak = new Request(BASE, { method: "POST", headers: { ...base, "content-type": "application/json" }, body: "{rusak" });
    expect((await api.create(rusak)).status).toBe(400);

    const besar = new Request(BASE, {
      method: "POST",
      headers: { ...base, "content-type": "application/json" },
      body: JSON.stringify(valid({ abstract: "a".repeat(300 * 1024) })),
    });
    expect((await api.create(besar)).status).toBe(413);
    expect(await ctx.db.select().from(innovations)).toHaveLength(0);
  });
});

describe("alur lengkap lewat HTTP", () => {
  it("buat -> ubah -> ajukan -> tarik -> hapus, dengan format respons yang konsisten", async () => {
    const me = await login("dosen@uninus.ac.id");
    const cat = await category();

    const created = await api.create(req("POST", BASE, me, valid()));
    expect(created.status).toBe(201);
    const c = (await created.json()).data;
    expect(c).toMatchObject({ status: "draft", isOwner: true });
    expect(c.leadResearcherId).toEqual(expect.any(String));

    const patched = await api.patch(req("PATCH", `${BASE}/${c.id}`, me, { categoryIds: [cat], year: 2025 }), c.id);
    expect(patched.status).toBe(200);
    expect((await patched.json()).data).toMatchObject({ categoryIds: [cat], year: 2025 });

    const submitted = await api.submit(req("POST", `${BASE}/${c.id}/submit`, me), c.id);
    expect(submitted.status).toBe(200);
    expect((await submitted.json()).data.status).toBe("submitted");

    // Terkunci: tidak bisa diedit saat diajukan; pengajuan ulang konflik (409).
    expect((await api.patch(req("PATCH", `${BASE}/${c.id}`, me, { year: 2020 }), c.id)).status).toBe(403);
    expect((await api.submit(req("POST", `${BASE}/${c.id}/submit`, me), c.id)).status).toBe(409);

    expect((await api.withdraw(req("POST", `${BASE}/${c.id}/withdraw`, me), c.id)).status).toBe(200);
    const hist = (await (await api.history(req("GET", `${BASE}/${c.id}/history`, me), c.id)).json()).data;
    expect(hist.map((h: { toStatus: string }) => h.toStatus)).toEqual(["draft", "submitted", "draft"]);

    expect((await api.remove(req("DELETE", `${BASE}/${c.id}`, me), c.id)).status).toBe(200);
    expect((await api.get(req("GET", `${BASE}/${c.id}`, me), c.id)).status).toBe(404);
  });

  it("validasi: 400 dengan detail per-field dan pesan Bahasa Indonesia", async () => {
    const me = await login("dosen@uninus.ac.id");
    const res = await api.create(req("POST", BASE, me, { title: "abc", summary: "pendek", status: "published" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Data yang dikirim tidak valid.");
    expect(body.error.details.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain("published");
  });

  it("pengajuan tak lengkap: 400 dengan daftar yang kurang", async () => {
    const me = await login("dosen@uninus.ac.id");
    const c = (await (await api.create(req("POST", BASE, me, valid()))).json()).data;
    const res = await api.submit(req("POST", `${BASE}/${c.id}/submit`, me), c.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.details.map((d: { field: string }) => d.field)).toEqual(["categoryIds"]);
  });

  it("daftar: meta paginasi, per_page dibatasi 50, status tidak dikenal 400", async () => {
    const me = await login("dosen@uninus.ac.id");
    for (let i = 1; i <= 3; i++) {
      await api.create(req("POST", BASE, me, valid({ title: `[DUMMY] Inovasi nomor ${i}` })));
    }
    const page = await (await api.list(req("GET", `${BASE}?per_page=2&page=2`, me))).json();
    expect(page.meta).toEqual({ page: 2, per_page: 2, total: 3 });
    expect(page.data).toHaveLength(1);

    const capped = await (await api.list(req("GET", `${BASE}?per_page=9999`, me))).json();
    expect(capped.meta.per_page).toBe(50);

    expect((await api.list(req("GET", `${BASE}?status=ngawur`, me))).status).toBe(400);
    expect((await (await api.list(req("GET", `${BASE}?status=published`, me))).json()).meta.total).toBe(0);
  });
});

describe("isolasi antar pengguna", () => {
  it("pengguna lain mendapat 404 (bukan 403) di semua rute, dan data tidak berubah", async () => {
    const owner = await login("a@uninus.ac.id");
    const other = await login("b@uninus.ac.id");
    const cat = await category();
    const c = (await (await api.create(req("POST", BASE, owner, valid({ categoryIds: [cat] })))).json()).data;

    const attempts = [
      api.get(req("GET", `${BASE}/${c.id}`, other), c.id),
      api.patch(req("PATCH", `${BASE}/${c.id}`, other, { title: "[DUMMY] Dibajak" }), c.id),
      api.remove(req("DELETE", `${BASE}/${c.id}`, other), c.id),
      api.submit(req("POST", `${BASE}/${c.id}/submit`, other), c.id),
      api.withdraw(req("POST", `${BASE}/${c.id}/withdraw`, other), c.id),
      api.history(req("GET", `${BASE}/${c.id}/history`, other), c.id),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);

    const list = await (await api.list(req("GET", BASE, other))).json();
    expect(list.meta.total).toBe(0);
    const [row] = await ctx.db.select().from(innovations);
    expect(row).toMatchObject({ title: c.title, status: "draft", deletedAt: null });
  });

  it("operator pun tidak bisa mengajukan atau menghapus draft milik dosen lewat rute dosen", async () => {
    const owner = await login("a@uninus.ac.id");
    const op = await login("op@uninus.ac.id", "operator");
    const cat = await category();
    const c = (await (await api.create(req("POST", BASE, owner, valid({ categoryIds: [cat] })))).json()).data;
    expect((await api.submit(req("POST", `${BASE}/${c.id}/submit`, op), c.id)).status).toBe(404);
    expect((await api.withdraw(req("POST", `${BASE}/${c.id}/withdraw`, op), c.id)).status).toBe(404);
  });
});
