import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/modules/auth/authorize";
import { ROLE_PERMISSIONS, type RoleCode } from "@/modules/auth/permissions";
import { createInnovationService } from "@/modules/innovations/service";
import type { ServiceResult } from "@/modules/innovations/service-core";
import { createAuthHandlers } from "@/platform/auth/handlers";
import { getUploadLimits } from "@/platform/config/uploads";
import { auditLogs, innovationFiles, innovations, users } from "@/platform/db/schema";
import { seedRbac } from "@/platform/db/seed/rbac";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createLocalStorage } from "@/platform/storage/storage";
import { createFilesHandlers } from "./handlers";
import { createFilesService } from "./service";

const APP_URL = "http://localhost:3000";
const SECRET = "x".repeat(40);
const LIMITS = { maxImageBytes: 200_000, maxDocumentBytes: 300_000, maxFilesPerInnovation: 4 };

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
let root: string;
const onPublicChange = vi.fn();
const storage = () => createLocalStorage(root);
const svc = (limits = LIMITS) => createFilesService(ctx.db, storage(), limits, { onPublicChange });

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
  await seedRbac(ctx.db);
  root = await mkdtemp(path.join(tmpdir(), "inovasi-files-"));
  onPublicChange.mockClear();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

let n = 0;
async function makeActor(role: RoleCode): Promise<AuthUser> {
  const [u] = await ctx.db
    .insert(users)
    .values({ ssoSubject: `s-${++n}`, email: `u${n}@uninus.ac.id`, name: `[DUMMY] ${role}` })
    .returning();
  return { id: u.id, permissions: new Set(ROLE_PERMISSIONS[role]) };
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

async function makeInnovation(actor: AuthUser, status: "draft" | "published" = "draft") {
  const inv = ok(await createInnovationService(ctx.db).createDraft(actor, { title: "[DUMMY] Inovasi Berkas" }));
  if (status === "published") await ctx.db.update(innovations).set({ status: "published" }).where(eq(innovations.id, inv.id));
  return inv.id;
}

/** JPEG nyata berisi metadata EXIF, supaya kita bisa membuktikan metadatanya hilang. */
const jpegWithExif = (w = 64, h = 48, color = "#0a8") =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "RAHASIA-LOKASI-DOSEN", Artist: "Nama Dosen" } })
    .toBuffer();

const upload = (actor: AuthUser, id: string, bytes: Buffer, filename = "foto.jpg", mime = "image/jpeg", extra: object = {}) =>
  svc().upload(actor, id, { filename, declaredMime: mime, bytes, ...extra });

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200, 0x20), Buffer.from("\n%%EOF")]);

async function filesOnDisk(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of await readdir(root).catch(() => [])) for (const f of await readdir(path.join(root, dir))) out.push(`${dir}/${f}`);
  return out;
}

describe("unggah gambar", () => {
  it("di-re-encode ke WebP tanpa EXIF, ada varian kecil, sampul otomatis, alt bawaan dari judul", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op);
    const original = await jpegWithExif();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const item = ok(await upload(op, id, original));
    expect(item).toMatchObject({ kind: "image", visibility: "public", isCover: true, mimeType: "image/webp", altText: "[DUMMY] Inovasi Berkas" });

    const files = await filesOnDisk();
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith("-thumb.webp"))).toBe(true);
    for (const f of files) {
      const bytes = await storage().get(f);
      const meta = await sharp(bytes!).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(bytes!.toString("latin1")).not.toContain("RAHASIA-LOKASI-DOSEN");
    }
    const audit = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "file.upload"));
    expect(audit).toHaveLength(1);
  });

  it("gambar besar diperkecil (maks 1600 px, thumb 480 px)", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op);
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#123" } }).jpeg({ quality: 40 }).toBuffer();
    ok(await svc({ ...LIMITS, maxImageBytes: 5_000_000 }).upload(op, id, { filename: "besar.jpg", declaredMime: "image/jpeg", bytes: big }));
    const dims = await Promise.all((await filesOnDisk()).map(async (f) => ({ f, m: await sharp((await storage().get(f))!).metadata() })));
    expect(Math.max(...dims.filter((d) => !d.f.includes("thumb")).map((d) => d.m.width!))).toBe(1600);
    expect(Math.max(...dims.filter((d) => d.f.includes("thumb")).map((d) => d.m.width!))).toBe(480);
  });

  it("hanya satu sampul: gambar kedua bukan sampul kecuali diminta, lalu sampul berpindah", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op);
    const first = ok(await upload(op, id, await jpegWithExif()));
    const second = ok(await upload(op, id, await jpegWithExif(60, 40, "#a80")));
    expect(second.isCover).toBe(false);
    const third = ok(await upload(op, id, await jpegWithExif(50, 50, "#08a"), "c.jpg", "image/jpeg", { isCover: true }));
    expect(third.isCover).toBe(true);
    const list = ok(await svc().list(op, id));
    expect(list.filter((f) => f.isCover).map((f) => f.id)).toEqual([third.id]);
    expect(list.find((f) => f.id === first.id)?.isCover).toBe(false);

    ok(await svc().update(op, second.id, { isCover: true }));
    expect(ok(await svc().list(op, id)).filter((f) => f.isCover).map((f) => f.id)).toEqual([second.id]);
  });
});

describe("penolakan unggahan", () => {
  it("polyglot, MIME palsu, ekstensi terlarang, dan gambar rusak ditolak tanpa meninggalkan berkas", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op);
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    fails(await upload(op, id, html, "x.jpg", "image/jpeg"), "VALIDATION_ERROR");
    fails(await upload(op, id, await jpegWithExif(), "x.jpg", "text/html"), "VALIDATION_ERROR");
    fails(await upload(op, id, await jpegWithExif(), "x.svg", "image/svg+xml"), "VALIDATION_ERROR");
    fails(await upload(op, id, await jpegWithExif(), "x.png", "image/png"), "VALIDATION_ERROR");
    // Magic bytes JPEG valid tetapi isinya sampah: lolos deteksi, gagal didekode.
    const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("bukan gambar sungguhan, hanya sampah acak")]);
    const bad = fails(await upload(op, id, corrupt), "VALIDATION_ERROR");
    expect(bad.message).toMatch(/rusak/);
    expect(await filesOnDisk()).toHaveLength(0);
    expect(await ctx.db.select().from(innovationFiles)).toHaveLength(0);
  });

  it("melebihi batas ukuran (gambar dan dokumen) 413, dan batas jumlah per inovasi", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op);
    const hugeImage = await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png({ compressionLevel: 0 }).toBuffer();
    expect(hugeImage.length).toBeGreaterThan(LIMITS.maxImageBytes);
    fails(await upload(op, id, hugeImage, "b.png", "image/png"), "PAYLOAD_TOO_LARGE");
    fails(await upload(op, id, Buffer.concat([PDF, Buffer.alloc(LIMITS.maxDocumentBytes)]), "b.pdf", "application/pdf"), "PAYLOAD_TOO_LARGE");

    for (let i = 0; i < LIMITS.maxFilesPerInnovation; i++) ok(await upload(op, id, PDF, `d${i}.pdf`, "application/pdf"));
    const over = fails(await upload(op, id, PDF, "lagi.pdf", "application/pdf"), "VALIDATION_ERROR");
    expect(over.message).toMatch(/Maksimal 4 berkas/);
    expect(await filesOnDisk()).toHaveLength(LIMITS.maxFilesPerInnovation);
  });

  it("inovasi tidak ada atau sudah dihapus: NOT_FOUND dan berkas yang sempat ditulis dibersihkan", async () => {
    const op = await makeActor("operator");
    fails(await upload(op, crypto.randomUUID(), await jpegWithExif()), "NOT_FOUND");
    fails(await upload(op, "bukan-uuid", await jpegWithExif()), "NOT_FOUND");
    expect(await filesOnDisk()).toHaveLength(0);
  });
});

describe("akses", () => {
  it("tanpa file.manage_any semua operasi 404 dan tidak ada yang tersimpan", async () => {
    const op = await makeActor("operator");
    const dosen = await makeActor("researcher");
    const id = await makeInnovation(op);
    const item = ok(await upload(op, id, await jpegWithExif()));
    const before = (await filesOnDisk()).length;

    fails(await upload(dosen, id, await jpegWithExif()), "NOT_FOUND");
    fails(await svc().list(dosen, id), "NOT_FOUND");
    fails(await svc().update(dosen, item.id, { visibility: "restricted" }), "NOT_FOUND");
    fails(await svc().remove(dosen, item.id), "NOT_FOUND");
    expect(await svc().read({ type: "admin", actor: dosen }, item.id)).toBeNull();
    expect(await filesOnDisk()).toHaveLength(before);
  });
});

describe("dokumen dan visibilitas", () => {
  it("PDF default restricted: tidak tampil publik walau inovasi terbit, sampai dijadikan publik", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op, "published");
    const doc = ok(await upload(op, id, PDF, "laporan akhir.pdf", "application/pdf"));
    expect(doc).toMatchObject({ kind: "document", visibility: "restricted", isCover: false, title: "laporan akhir" });

    expect(await svc().read({ type: "public" }, doc.id)).toBeNull();
    expect((await svc().read({ type: "admin", actor: op }, doc.id))?.mime).toBe("application/pdf");

    ok(await svc().update(op, doc.id, { visibility: "public" }));
    expect((await svc().read({ type: "public" }, doc.id))?.bytes.equals(PDF)).toBe(true);
    expect(onPublicChange).toHaveBeenCalled();
  });

  it("berkas publik milik draft, inovasi ditarik, atau dihapus tidak tampil publik", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op, "draft");
    const img = ok(await upload(op, id, await jpegWithExif()));
    expect(await svc().read({ type: "public" }, img.id)).toBeNull();

    await ctx.db.update(innovations).set({ status: "published" }).where(eq(innovations.id, id));
    expect(await svc().read({ type: "public" }, img.id)).not.toBeNull();
    expect(await svc().read({ type: "public" }, img.id, "thumb")).not.toBeNull();

    await ctx.db.update(innovations).set({ status: "unpublished" }).where(eq(innovations.id, id));
    expect(await svc().read({ type: "public" }, img.id)).toBeNull();
    await ctx.db.update(innovations).set({ status: "published" }).where(eq(innovations.id, id));
    await ctx.db.update(innovations).set({ deletedAt: new Date() }).where(eq(innovations.id, id));
    expect(await svc().read({ type: "public" }, img.id)).toBeNull();
  });

  it("sampul yang dijadikan restricted tidak lagi sampul; sampul harus gambar publik", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op);
    const img = ok(await upload(op, id, await jpegWithExif()));
    const doc = ok(await upload(op, id, PDF, "a.pdf", "application/pdf"));
    expect(ok(await svc().update(op, img.id, { visibility: "restricted" })).isCover).toBe(false);
    fails(await svc().update(op, doc.id, { isCover: true }), "VALIDATION_ERROR");
    fails(await svc().update(op, img.id, { isCover: true }), "VALIDATION_ERROR");
    ok(await svc().update(op, img.id, { isCover: true, visibility: "public" }));
  });

  it("perubahan tidak dikenal, kosong, atau mencabut sampul ditolak", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op);
    const img = ok(await upload(op, id, await jpegWithExif()));
    fails(await svc().update(op, img.id, {}), "VALIDATION_ERROR");
    fails(await svc().update(op, img.id, { sha256: "x" }), "VALIDATION_ERROR");
    fails(await svc().update(op, img.id, { isCover: false }), "VALIDATION_ERROR");
    fails(await svc().update(op, img.id, { visibility: "rahasia" }), "VALIDATION_ERROR");
  });
});

describe("hapus", () => {
  it("menghapus baris dan semua berkas fisik, dan sampul digantikan gambar publik berikutnya", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op);
    const a = ok(await upload(op, id, await jpegWithExif()));
    const b = ok(await upload(op, id, await jpegWithExif(40, 40, "#c30")));
    expect(await filesOnDisk()).toHaveLength(4);

    ok(await svc().remove(op, a.id));
    expect(await filesOnDisk()).toHaveLength(2);
    const list = ok(await svc().list(op, id));
    expect(list.map((f) => [f.id, f.isCover])).toEqual([[b.id, true]]);
    fails(await svc().remove(op, a.id), "NOT_FOUND");
    expect(await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "file.delete"))).toHaveLength(1);
  });

  it("menghapus inovasi tidak boleh meninggalkan akses ke berkasnya", async () => {
    const op = await makeActor("operator");
    const id = await makeInnovation(op, "published");
    const img = ok(await upload(op, id, await jpegWithExif()));
    await ctx.db.update(innovations).set({ deletedAt: new Date() }).where(eq(innovations.id, id));
    expect(await svc().read({ type: "public" }, img.id)).toBeNull();
    fails(await svc().list(op, id), "NOT_FOUND");
  });
});

describe("HTTP", () => {
  const env = { DEV_LOGIN: "1", APP_ENV: "development", NODE_ENV: "test" };

  async function setup(role: "operator" | "researcher" = "operator") {
    const auth = createAuthHandlers({ db: ctx.db, appUrl: APP_URL, secret: SECRET, env });
    const api = createFilesHandlers({ auth, service: svc(), limits: LIMITS });
    const login = await auth.devLogin(
      new Request(`${APP_URL}/api/v1/auth/dev-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: JSON.stringify({ email: `${role}@uninus.ac.id`, role }),
      }),
    );
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const csrf = (await (await auth.csrf(new Request(`${APP_URL}/api/v1/auth/csrf`, { headers: { cookie } }))).json()).data.token as string;
    const [u] = await ctx.db.select().from(users).where(eq(users.email, `${role}@uninus.ac.id`));
    return { api, cookie, csrf, actor: { id: u.id, permissions: new Set(ROLE_PERMISSIONS[role]) } as AuthUser };
  }

  function form(bytes: Buffer, filename: string, mime: string, extra: Record<string, string> = {}) {
    const f = new FormData();
    f.set("file", new File([new Uint8Array(bytes)], filename, { type: mime }));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  }

  const post = (url: string, body: BodyInit, headers: Record<string, string>) =>
    new Request(url, { method: "POST", headers: { origin: APP_URL, ...headers }, body });

  it("unggah lewat multipart lalu sajikan: header keamanan lengkap, ETag dan 304", async () => {
    const { api, cookie, csrf, actor } = await setup();
    const id = await makeInnovation(actor, "published");
    const res = await api.upload(
      post(`${APP_URL}/api/v1/admin/innovations/${id}/files`, form(await jpegWithExif(), "sampul.jpg", "image/jpeg", { altText: "Alat pengering", title: "Sampul" }), { cookie, "x-csrf-token": csrf }),
      id,
    );
    expect(res.status).toBe(201);
    const item = (await res.json()).data;
    expect(item).toMatchObject({ altText: "Alat pengering", title: "Sampul", isCover: true });

    const pub = await api.servePublic(new Request(`${APP_URL}/api/v1/files/${item.id}`), item.id);
    expect(pub.status).toBe(200);
    expect(pub.headers.get("content-type")).toBe("image/webp");
    expect(pub.headers.get("x-content-type-options")).toBe("nosniff");
    expect(pub.headers.get("content-security-policy")).toContain("sandbox");
    expect(pub.headers.get("cache-control")).toBe("no-cache");
    const etag = pub.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const again = await api.servePublic(new Request(`${APP_URL}/api/v1/files/${item.id}`, { headers: { "if-none-match": etag } }), item.id);
    expect(again.status).toBe(304);
    const thumb = await api.servePublic(new Request(`${APP_URL}/api/v1/files/${item.id}?v=thumb`), item.id);
    expect((await thumb.arrayBuffer()).byteLength).toBeLessThan((await pub.arrayBuffer()).byteLength + 1);
  });

  it("berkas restricted atau milik draft: 404 untuk publik, tetapi terbuka bagi operator", async () => {
    const { api, cookie, actor } = await setup();
    const id = await makeInnovation(actor, "draft");
    const item = ok(await svc().upload(actor, id, { filename: "a.pdf", declaredMime: "application/pdf", bytes: PDF }));
    expect((await api.servePublic(new Request(`${APP_URL}/api/v1/files/${item.id}`), item.id)).status).toBe(404);
    expect((await api.serveAdmin(new Request(`${APP_URL}/api/v1/admin/files/${item.id}`), item.id)).status).toBe(401);
    const adm = await api.serveAdmin(new Request(`${APP_URL}/api/v1/admin/files/${item.id}`, { headers: { cookie } }), item.id);
    expect(adm.status).toBe(200);
    expect(adm.headers.get("cache-control")).toContain("private");
    expect(adm.headers.get("content-disposition")).toMatch(/^inline; filename="a\.pdf"$/);
    expect((await api.servePublic(new Request(`${APP_URL}/api/v1/files/bukan-uuid`), "bukan-uuid")).status).toBe(404);
  });

  it("menolak: tanpa login, tanpa CSRF/Origin, bukan multipart, terlalu besar, tanpa berkas, dan peran tanpa izin", async () => {
    const { api, cookie, csrf, actor } = await setup();
    const id = await makeInnovation(actor);
    const url = `${APP_URL}/api/v1/admin/innovations/${id}/files`;
    const body = form(await jpegWithExif(), "a.jpg", "image/jpeg");

    expect((await api.upload(post(url, body, {}), id)).status).toBe(401);
    expect((await api.upload(post(url, form(await jpegWithExif(), "a.jpg", "image/jpeg"), { cookie }), id)).status).toBe(403);
    expect((await api.upload(post(url, form(await jpegWithExif(), "a.jpg", "image/jpeg"), { cookie, "x-csrf-token": csrf, origin: "https://jahat.example" }), id)).status).toBe(403);
    expect((await api.upload(post(url, "{}", { cookie, "x-csrf-token": csrf, "content-type": "application/json" }), id)).status).toBe(415);
    const huge = new Request(url, { method: "POST", headers: { origin: APP_URL, cookie, "x-csrf-token": csrf, "content-type": "multipart/form-data; boundary=x", "content-length": "999999999" }, body: "x" });
    expect((await api.upload(huge, id)).status).toBe(413);
    expect((await api.upload(post(url, new FormData(), { cookie, "x-csrf-token": csrf }), id)).status).toBe(400);
    expect((await api.upload(post(url, form(Buffer.from("<html>"), "a.jpg", "image/jpeg"), { cookie, "x-csrf-token": csrf }), id)).status).toBe(400);
    expect(await ctx.db.select().from(innovationFiles)).toHaveLength(0);

    const dosen = await setup("researcher");
    expect((await dosen.api.upload(post(url, form(await jpegWithExif(), "a.jpg", "image/jpeg"), { cookie: dosen.cookie, "x-csrf-token": dosen.csrf }), id)).status).toBe(403);
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it("batas bawaan sesuai SECURITY.md (5 MB, 20 MB, 20 berkas)", () => {
    expect(getUploadLimits({})).toEqual({ maxImageBytes: 5 * 1024 * 1024, maxDocumentBytes: 20 * 1024 * 1024, maxFilesPerInnovation: 20 });
    expect(getUploadLimits({ UPLOAD_MAX_IMAGE_MB: "2", UPLOAD_MAX_DOC_MB: "abc" })).toMatchObject({ maxImageBytes: 2 * 1024 * 1024, maxDocumentBytes: 20 * 1024 * 1024 });
  });
});
