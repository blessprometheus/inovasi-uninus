import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categories,
  faculties,
  innovationCategories,
  innovationFiles,
  innovationMembers,
  innovations,
  intellectualProperties,
  publications,
  researchers,
  users,
} from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createPgCatalogProvider, escapeLike } from "./pg-provider";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
let owner: string;

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
  const [u] = await ctx.db
    .insert(users)
    .values({ ssoSubject: "sub-1", email: "dosen@uninus.ac.id", name: "[DUMMY] Dosen" })
    .returning();
  owner = u.id;
});

type Status = "draft" | "published" | "submitted";

async function addInnovation(
  slug: string,
  over: Partial<typeof innovations.$inferInsert> & { status?: Status } = {},
) {
  const [i] = await ctx.db
    .insert(innovations)
    .values({
      slug,
      title: `[DUMMY] Judul ${slug}`,
      summary: `[DUMMY] Ringkasan ${slug}`,
      submittedBy: owner,
      status: "published",
      publishedAt: new Date("2025-01-01T00:00:00Z"),
      ...over,
    })
    .returning();
  return i;
}

async function addResearcher(slug: string, over: Partial<typeof researchers.$inferInsert> = {}) {
  const [r] = await ctx.db
    .insert(researchers)
    .values({ slug, fullName: `[DUMMY] ${slug}`, ...over })
    .returning();
  return r;
}

const provider = () => createPgCatalogProvider(ctx.db);

describe("escapeLike", () => {
  it("meloloskan %, _ dan backslash", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});

describe("katalog PostgreSQL: visibilitas publik", () => {
  it("hanya inovasi published dan tidak terhapus yang muncul di pencarian, detail, dan sitemap", async () => {
    await addInnovation("terbit");
    await addInnovation("masih-draft", { status: "draft", publishedAt: null });
    await addInnovation("diajukan", { status: "submitted", publishedAt: null });
    await addInnovation("terhapus", { deletedAt: new Date() });

    const p = provider();
    const { items, total } = await p.search({ page: 1, perPage: 12 });
    expect(items.map((i) => i.slug)).toEqual(["terbit"]);
    expect(total).toBe(1);

    expect(await p.getBySlug("terbit")).not.toBeNull();
    for (const hidden of ["masih-draft", "diajukan", "terhapus", "tidak-ada"]) {
      expect(await p.getBySlug(hidden)).toBeNull();
    }
    expect((await p.listSlugs()).map((s) => s.slug)).toEqual(["terbit"]);
    const home = await p.home();
    expect([...home.featured, ...home.latest].map((i) => i.slug)).toEqual(["terbit"]);
  });

  it("database kosong: hasil kosong dan statistik null", async () => {
    const p = provider();
    expect(await p.search({ page: 1, perPage: 12 })).toEqual({ items: [], total: 0 });
    expect(await p.home()).toEqual({ featured: [], latest: [], stats: null });
    expect(await p.listSlugs()).toEqual([]);
  });
});

describe("katalog PostgreSQL: pencarian dan paginasi", () => {
  it("mencari di judul dan ringkasan, tidak peka huruf besar/kecil", async () => {
    await addInnovation("a", { title: "[DUMMY] Pengering Padi Surya", summary: "[DUMMY] Alat" });
    await addInnovation("b", { title: "[DUMMY] Aplikasi Desa", summary: "[DUMMY] Pengolahan limbah plastik" });
    const p = provider();
    expect((await p.search({ q: "PENGERING", page: 1, perPage: 12 })).items.map((i) => i.slug)).toEqual(["a"]);
    expect((await p.search({ q: "limbah", page: 1, perPage: 12 })).items.map((i) => i.slug)).toEqual(["b"]);
    expect((await p.search({ q: "tidak-ada-kata-ini", page: 1, perPage: 12 })).total).toBe(0);
  });

  it("karakter % dan _ dari pengguna bukan wildcard", async () => {
    await addInnovation("a", { title: "[DUMMY] Padi", summary: "[DUMMY] Biasa" });
    const p = provider();
    expect((await p.search({ q: "%", page: 1, perPage: 12 })).total).toBe(0);
    expect((await p.search({ q: "_", page: 1, perPage: 12 })).total).toBe(0);
  });

  it("input aneh tidak membuat query gagal atau menyuntikkan SQL", async () => {
    await addInnovation("a");
    const p = provider();
    for (const q of ["'; drop table innovations; --", '"', "& | !", "(((", "\\"]) {
      await expect(p.search({ q, page: 1, perPage: 12 })).resolves.toBeDefined();
    }
    expect((await p.search({ page: 1, perPage: 12 })).total).toBe(1);
  });

  it("paginasi: total tetap penuh, item dipotong, urut terbaru dulu", async () => {
    for (let n = 1; n <= 5; n++) {
      await addInnovation(`i-${n}`, { publishedAt: new Date(`2025-01-0${n}T00:00:00Z`) });
    }
    const p = provider();
    const p1 = await p.search({ page: 1, perPage: 2 });
    const p3 = await p.search({ page: 3, perPage: 2 });
    expect(p1.total).toBe(5);
    expect(p1.items.map((i) => i.slug)).toEqual(["i-5", "i-4"]);
    expect(p3.items.map((i) => i.slug)).toEqual(["i-1"]);
  });
});

describe("katalog PostgreSQL: beranda", () => {
  it("unggulan terpisah dari terbaru, statistik dihitung dari data terbit saja", async () => {
    const fac = (await ctx.db.insert(faculties).values({ slug: "f1", name: "[DUMMY] Fakultas" }).returning())[0];
    const r1 = await addResearcher("r1");
    const r2 = await addResearcher("r2");
    const unggulan = await addInnovation("unggulan", { isFeatured: true, featuredAt: new Date(), facultyId: fac.id });
    const biasa = await addInnovation("biasa", { facultyId: fac.id });
    const draft = await addInnovation("draft", { status: "draft", publishedAt: null });
    await ctx.db.insert(innovationMembers).values([
      { innovationId: unggulan.id, researcherId: r1.id, role: "lead" },
      { innovationId: biasa.id, researcherId: r2.id, role: "lead" },
      { innovationId: draft.id, researcherId: r2.id, role: "lead" },
    ]);

    const home = await provider().home();
    expect(home.featured.map((i) => i.slug)).toEqual(["unggulan"]);
    expect(home.latest.map((i) => i.slug)).toEqual(["biasa"]);
    expect(home.stats).toEqual({ innovations: 2, researchers: 2, faculties: 1 });
  });
});

describe("katalog PostgreSQL: detail", () => {
  it("memuat tim (ketua dulu), kategori, HKI, dan publikasi", async () => {
    const fac = (await ctx.db.insert(faculties).values({ slug: "f1", name: "[DUMMY] Fakultas" }).returning())[0];
    const cat = (await ctx.db.insert(categories).values({ slug: "k1", name: "[DUMMY] Kategori" }).returning())[0];
    const inv = await addInnovation("detail", {
      facultyId: fac.id,
      year: 2024,
      abstract: "[DUMMY] Abstrak",
      methodology: null,
    });
    const lead = await addResearcher("ketua");
    const member = await addResearcher("anggota");
    await ctx.db.insert(innovationMembers).values([
      { innovationId: inv.id, researcherId: member.id, role: "member", sortOrder: 0 },
      { innovationId: inv.id, researcherId: lead.id, role: "lead", sortOrder: 1 },
    ]);
    await ctx.db.insert(innovationCategories).values({ innovationId: inv.id, categoryId: cat.id });
    await ctx.db.insert(intellectualProperties).values({ innovationId: inv.id, kind: "hki", status: "[DUMMY] Terdaftar" });
    await ctx.db.insert(publications).values([
      { innovationId: inv.id, title: "[DUMMY] Pub B", sortOrder: 1 },
      { innovationId: inv.id, title: "[DUMMY] Pub A", url: "https://example.com/a", sortOrder: 0 },
    ]);

    const d = await provider().getBySlug("detail");
    expect(d?.members).toEqual([
      { name: "[DUMMY] ketua", role: "lead" },
      { name: "[DUMMY] anggota", role: "member" },
    ]);
    expect(d?.categoryName).toBe("[DUMMY] Kategori");
    expect(d?.facultyName).toBe("[DUMMY] Fakultas");
    expect(d?.leadResearcherName).toBe("[DUMMY] ketua");
    expect(d?.hasIp).toBe(true);
    expect(d?.intellectualProperties).toEqual([
      { kind: "hki", status: "[DUMMY] Terdaftar", registrationNumber: null, year: null },
    ]);
    expect(d?.publications.map((p) => p.title)).toEqual(["[DUMMY] Pub A", "[DUMMY] Pub B"]);
    expect(d?.abstract).toBe("[DUMMY] Abstrak");
    expect(d?.methodology).toBeNull();
    expect(d?.publishedAt).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("sampul dan dokumen publik", () => {
  const addFile = (innovationId: string, over: Partial<typeof innovationFiles.$inferInsert>) =>
    ctx.db
      .insert(innovationFiles)
      .values({ innovationId, kind: "image", visibility: "public", storageKey: "ab/x.webp", mimeType: "image/webp", sizeBytes: 10, ...over })
      .returning();

  it("kartu memakai varian kecil dari sampul publik, detail memakai varian penuh", async () => {
    const inv = await addInnovation("dengan-sampul");
    const [cover] = await addFile(inv.id, { isCover: true, altText: "[DUMMY] Alat" });
    const provider = createPgCatalogProvider(ctx.db);

    const page = await provider.search({ page: 1, perPage: 10 });
    expect(page.items[0]).toMatchObject({ coverUrl: `/api/v1/files/${cover.id}?v=thumb`, coverAlt: "[DUMMY] Alat" });
    const detail = await provider.getBySlug("dengan-sampul");
    expect(detail?.coverUrl).toBe(`/api/v1/files/${cover.id}`);
  });

  it("tanpa sampul, atau sampul restricted, atau bukan gambar: tidak ada gambar di katalog", async () => {
    const a = await addInnovation("tanpa-sampul");
    await addFile(a.id, { isCover: false });
    const b = await addInnovation("sampul-terbatas");
    await addFile(b.id, { isCover: true, visibility: "restricted" });
    const items = (await createPgCatalogProvider(ctx.db).search({ page: 1, perPage: 10 })).items;
    expect(items.map((i) => i.coverUrl)).toEqual([null, null]);
  });

  it("detail hanya memuat dokumen publik (bukan restricted, bukan gambar), dengan judul dan ukuran", async () => {
    const inv = await addInnovation("dengan-dokumen");
    const [pub] = await addFile(inv.id, { kind: "document", mimeType: "application/pdf", title: "[DUMMY] Laporan", sizeBytes: 2048, storageKey: "ab/y.pdf" });
    await addFile(inv.id, { kind: "document", visibility: "restricted", mimeType: "application/pdf", title: "[DUMMY] Rahasia", storageKey: "ab/z.pdf" });
    await addFile(inv.id, { kind: "image" });
    const detail = await createPgCatalogProvider(ctx.db).getBySlug("dengan-dokumen");
    expect(detail?.documents).toEqual([{ id: pub.id, title: "[DUMMY] Laporan", sizeBytes: 2048 }]);
    expect(JSON.stringify(detail)).not.toContain("Rahasia");
  });
});
