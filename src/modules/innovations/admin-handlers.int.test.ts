import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgCatalogProvider } from "@/modules/catalog/pg-provider";
import { createTaxonomyHandlers } from "@/modules/taxonomy/handlers";
import { createTaxonomyService } from "@/modules/taxonomy/service";
import { createAuthHandlers } from "@/platform/auth/handlers";
import { innovations } from "@/platform/db/schema";
import { seedRbac } from "@/platform/db/seed/rbac";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createAdminInnovationHandlers } from "./admin-handlers";
import { createAdminInnovationService } from "./admin-service";
import { createInnovationHandlers } from "./handlers";
import { createInnovationService } from "./service";

const APP_URL = "http://localhost:3000";
const SECRET = "x".repeat(40);
const DEV_ENV = { DEV_LOGIN: "1", APP_ENV: "development", NODE_ENV: "test" };
const API = `${APP_URL}/api/v1`;

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
let auth: ReturnType<typeof createAuthHandlers>;
let dosenApi: ReturnType<typeof createInnovationHandlers>;
let adminApi: ReturnType<typeof createAdminInnovationHandlers>;
let taxApi: ReturnType<typeof createTaxonomyHandlers>;
const onPublicChange = vi.fn();
const onTaxonomyChange = vi.fn();

beforeAll(async () => {
  ctx = await setupTestDb();
  auth = createAuthHandlers({ db: ctx.db, appUrl: APP_URL, secret: SECRET, env: DEV_ENV });
  const service = createInnovationService(ctx.db);
  dosenApi = createInnovationHandlers({ auth, service });
  adminApi = createAdminInnovationHandlers({
    auth,
    service: createAdminInnovationService(ctx.db, service, { onPublicChange }),
  });
  taxApi = createTaxonomyHandlers({ auth, service: createTaxonomyService(ctx.db), onChange: onTaxonomyChange });
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
  await seedRbac(ctx.db);
  onPublicChange.mockClear();
  onTaxonomyChange.mockClear();
});

interface Client {
  cookie: string;
  csrf: string;
}

async function login(email: string, role: "researcher" | "operator" | "super_admin"): Promise<Client> {
  const res = await auth.devLogin(
    new Request(`${API}/auth/dev-login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_URL },
      body: JSON.stringify({ email, role }),
    }),
  );
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  const csrf = (await (await auth.csrf(new Request(`${API}/auth/csrf`, { headers: { cookie } }))).json()).data.token;
  return { cookie, csrf };
}

function req(method: string, path: string, client?: Client, body?: unknown) {
  const mutating = method !== "GET";
  return new Request(`${API}${path}`, {
    method,
    headers: {
      ...(client ? { cookie: client.cookie } : {}),
      ...(mutating ? { origin: APP_URL } : {}),
      ...(mutating && client ? { "x-csrf-token": client.csrf } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function json(res: Response) {
  return res.json();
}

async function pengajuan(dosen: Client) {
  const cat = (await json(await taxApi.create(req("POST", "/admin/categories", await opCache(), { name: "[DUMMY] Kategori" }), "categories"))).data;
  const created = (
    await json(
      await dosenApi.create(
        req("POST", "/me/innovations", dosen, {
          title: "[DUMMY] Pengering Padi Surya",
          summary: "[DUMMY] Ringkasan inovasi yang cukup panjang untuk lolos validasi.",
          categoryIds: [cat.id],
        }),
      ),
    )
  ).data;
  await dosenApi.submit(req("POST", `/me/innovations/${created.id}/submit`, dosen), created.id);
  return created as { id: string; slug: string };
}

let opClient: Client | undefined;
async function opCache() {
  opClient ??= await login("op@uninus.ac.id", "operator");
  return opClient;
}
beforeEach(() => {
  opClient = undefined;
});

describe("gerbang akses rute admin", () => {
  it("tanpa login 401; dosen biasa 403 di semua rute admin", async () => {
    const dosen = await login("dosen@uninus.ac.id", "researcher");
    const id = "01a1a48e-b38f-71da-829f-b542da9161af";
    const calls = (c?: Client) => [
      adminApi.list(req("GET", "/admin/innovations", c)),
      adminApi.get(req("GET", `/admin/innovations/${id}`, c), id),
      adminApi.patch(req("PATCH", `/admin/innovations/${id}`, c, {}), id),
      adminApi.transition(req("POST", `/admin/innovations/${id}/transitions`, c, { to: "under_review" }), id),
      adminApi.remove(req("DELETE", `/admin/innovations/${id}`, c, { reason: "[DUMMY] uji" }), id),
      taxApi.listAdmin(req("GET", "/admin/categories", c), "categories"),
      taxApi.create(req("POST", "/admin/categories", c, { name: "[DUMMY] Liar" }), "categories"),
      taxApi.update(req("PATCH", `/admin/categories/${id}`, c, { name: "[DUMMY] Liar" }), "categories", id),
    ];
    for (const res of await Promise.all(calls())) expect(res.status).toBe(401);
    for (const res of await Promise.all(calls(dosen))) expect(res.status).toBe(403);
    expect(onPublicChange).not.toHaveBeenCalled();
  });

  it("operator tanpa CSRF/Origin ditolak pada rute pengubah data", async () => {
    const op = await login("op@uninus.ac.id", "operator");
    const body = JSON.stringify({ to: "under_review" });
    const headers = { cookie: op.cookie, "content-type": "application/json" };
    const id = "01a1a48e-b38f-71da-829f-b542da9161af";
    const noCsrf = new Request(`${API}/x`, { method: "POST", headers: { ...headers, origin: APP_URL }, body });
    const noOrigin = new Request(`${API}/x`, { method: "POST", headers: { ...headers, "x-csrf-token": op.csrf }, body });
    for (const r of [noCsrf, noOrigin]) expect((await adminApi.transition(r, id)).status).toBe(403);
    expect((await taxApi.create(new Request(`${API}/x`, { method: "POST", headers: { ...headers, origin: APP_URL }, body: JSON.stringify({ name: "[DUMMY] X" }) }), "categories")).status).toBe(403);
  });
});

describe("alur HTTP: dosen mengajukan, operator menerbitkan", () => {
  it("dari pengajuan sampai tampil di katalog publik, lalu ditarik", async () => {
    const dosen = await login("dosen@uninus.ac.id", "researcher");
    const op = await opCache();
    const inv = await pengajuan(dosen);
    const catalog = createPgCatalogProvider(ctx.db);

    const list = await json(await adminApi.list(req("GET", "/admin/innovations?status=submitted", op)));
    expect(list.meta.total).toBe(1);
    expect(list.data[0].id).toBe(inv.id);

    for (const to of ["under_review", "approved", "published"]) {
      const res = await adminApi.transition(req("POST", `/admin/innovations/${inv.id}/transitions`, op, { to }), inv.id);
      expect(res.status).toBe(200);
      expect((await json(res)).data.status).toBe(to);
    }
    expect(onPublicChange).toHaveBeenCalledTimes(1);
    expect((await catalog.getBySlug(inv.slug))?.title).toBe("[DUMMY] Pengering Padi Surya");

    // Penarikan tanpa catatan ditolak 400; dengan catatan berhasil dan langsung hilang dari publik.
    const noNote = await adminApi.transition(req("POST", `/admin/innovations/${inv.id}/transitions`, op, { to: "unpublished" }), inv.id);
    expect(noNote.status).toBe(400);
    const withNote = await adminApi.transition(req("POST", `/admin/innovations/${inv.id}/transitions`, op, { to: "unpublished", note: "[DUMMY] Revisi data" }), inv.id);
    expect(withNote.status).toBe(200);
    expect(await catalog.getBySlug(inv.slug)).toBeNull();
    expect(onPublicChange).toHaveBeenCalledTimes(2);

    const detail = (await json(await adminApi.get(req("GET", `/admin/innovations/${inv.id}`, op), inv.id))).data;
    expect(detail.history.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      "draft", "submitted", "under_review", "approved", "published", "unpublished",
    ]);
  });

  it("transisi tidak sah 409, status tidak dikenal 400, filter ngawur 400", async () => {
    const dosen = await login("dosen@uninus.ac.id", "researcher");
    const op = await opCache();
    const inv = await pengajuan(dosen);
    const t = (to: string) => adminApi.transition(req("POST", `/admin/innovations/${inv.id}/transitions`, op, { to }), inv.id);

    expect((await t("published")).status).toBe(409);
    expect((await t("dihapus")).status).toBe(400);
    expect((await adminApi.list(req("GET", "/admin/innovations?status=ngawur", op))).status).toBe(400);
    expect((await adminApi.list(req("GET", "/admin/innovations?faculty_id=bukan-uuid", op))).status).toBe(400);
    expect((await ctx.db.select().from(innovations))[0].status).toBe("submitted");
  });

  it("dosen tidak bisa mengakali status lewat rute dosen: terkunci 403, pada draft 400", async () => {
    const dosen = await login("dosen@uninus.ac.id", "researcher");
    const inv = await pengajuan(dosen);
    const locked = await dosenApi.patch(req("PATCH", `/me/innovations/${inv.id}`, dosen, { status: "published" }), inv.id);
    expect(locked.status).toBe(403);

    await dosenApi.withdraw(req("POST", `/me/innovations/${inv.id}/withdraw`, dosen), inv.id);
    const draft = await dosenApi.patch(req("PATCH", `/me/innovations/${inv.id}`, dosen, { status: "published" }), inv.id);
    expect(draft.status).toBe(400);
    expect((await ctx.db.select().from(innovations))[0].status).toBe("draft");
  });
});

describe("acuan (taksonomi) lewat HTTP", () => {
  it("publik tanpa login hanya melihat yang aktif; operator mengelola dan cache publik disegarkan", async () => {
    const op = await login("op@uninus.ac.id", "operator");
    const created = await taxApi.create(req("POST", "/admin/faculties", op, { name: "[DUMMY] Fakultas Uji" }), "faculties");
    expect(created.status).toBe(201);
    const f = (await json(created)).data;
    expect(onTaxonomyChange).toHaveBeenCalledTimes(1);

    const publik = await json(await taxApi.listPublic("faculties"));
    expect(publik.data.map((x: { id: string }) => x.id)).toEqual([f.id]);

    const off = await taxApi.update(req("PATCH", `/admin/faculties/${f.id}`, op, { isActive: false }), "faculties", f.id);
    expect(off.status).toBe(200);
    expect((await json(await taxApi.listPublic("faculties"))).data).toEqual([]);
    expect((await json(await taxApi.listAdmin(req("GET", "/admin/faculties", op), "faculties"))).data).toHaveLength(1);

    const bad = await taxApi.create(req("POST", "/admin/faculties", op, { name: "x", slug: "curang" }), "faculties");
    expect(bad.status).toBe(400);
    expect(onTaxonomyChange).toHaveBeenCalledTimes(2);
  });
});
