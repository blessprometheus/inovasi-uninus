import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categories,
  faculties,
  innovationCategories,
  innovationTypes,
  innovations,
  intellectualProperties,
  studyPrograms,
  users,
} from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createPgCatalogProvider } from "./pg-provider";
import type { CatalogQuery } from "./types";

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
  const [u] = await ctx.db.insert(users).values({ ssoSubject: "s", email: "d@uninus.ac.id", name: "[DUMMY]" }).returning();
  owner = u.id;
});

const provider = () => createPgCatalogProvider(ctx.db);
const query = (over: Partial<CatalogQuery> = {}): CatalogQuery => ({ page: 1, perPage: 50, ...over });
const slugs = async (over: Partial<CatalogQuery> = {}) => (await provider().search(query(over))).items.map((i) => i.slug).sort();

async function seed() {
  const [fTek] = await ctx.db.insert(faculties).values({ slug: "teknik", name: "[DUMMY] Teknik" }).returning();
  const [fPer] = await ctx.db.insert(faculties).values({ slug: "pertanian", name: "[DUMMY] Pertanian" }).returning();
  const [pInf] = await ctx.db.insert(studyPrograms).values({ slug: "informatika", name: "[DUMMY] Informatika", facultyId: fTek.id }).returning();
  const [pAgr] = await ctx.db.insert(studyPrograms).values({ slug: "agro", name: "[DUMMY] Agroteknologi", facultyId: fPer.id }).returning();
  const [tProduk] = await ctx.db.insert(innovationTypes).values({ slug: "produk", name: "[DUMMY] Produk", sortOrder: 1 }).returning();
  const [tModel] = await ctx.db.insert(innovationTypes).values({ slug: "model", name: "[DUMMY] Model", sortOrder: 2 }).returning();
  const [cEnergi] = await ctx.db.insert(categories).values({ slug: "energi", name: "[DUMMY] Energi", sortOrder: 1 }).returning();
  const [cPangan] = await ctx.db.insert(categories).values({ slug: "pangan", name: "[DUMMY] Pangan", sortOrder: 2 }).returning();

  const make = async (slug: string, over: Partial<typeof innovations.$inferInsert>, cats: string[], hki = false) => {
    const [i] = await ctx.db
      .insert(innovations)
      .values({
        slug,
        title: `[DUMMY] ${slug}`,
        summary: "[DUMMY] Ringkasan",
        submittedBy: owner,
        status: "published",
        publishedAt: new Date("2025-01-01T00:00:00Z"),
        ...over,
      })
      .returning();
    for (const categoryId of cats) await ctx.db.insert(innovationCategories).values({ innovationId: i.id, categoryId });
    if (hki) await ctx.db.insert(intellectualProperties).values({ innovationId: i.id, kind: "hki" });
    return i;
  };

  await make("surya", { facultyId: fTek.id, studyProgramId: pInf.id, typeId: tProduk.id, year: 2023 }, [cEnergi.id], true);
  await make("biogas", { facultyId: fTek.id, studyProgramId: pInf.id, typeId: tModel.id, year: 2024 }, [cEnergi.id, cPangan.id]);
  await make("padi", { facultyId: fPer.id, studyProgramId: pAgr.id, typeId: tProduk.id, year: 2024 }, [cPangan.id], true);
  await make("tanpa-apa-apa", {}, []);
  // Draft dengan atribut yang sama tidak boleh pernah ikut.
  await make("draft", { status: "draft", publishedAt: null, facultyId: fTek.id, typeId: tProduk.id, year: 2024 }, [cEnergi.id], true);
  return { fTek, fPer, pInf, tProduk, cEnergi, cPangan };
}

describe("penyaring katalog PostgreSQL", () => {
  it("tiap penyaring menyempitkan hasil; kombinasi bersifat AND", async () => {
    await seed();
    expect(await slugs()).toEqual(["biogas", "padi", "surya", "tanpa-apa-apa"]);
    expect(await slugs({ category: "energi" })).toEqual(["biogas", "surya"]);
    expect(await slugs({ category: "pangan" })).toEqual(["biogas", "padi"]);
    expect(await slugs({ faculty: "teknik" })).toEqual(["biogas", "surya"]);
    expect(await slugs({ studyProgram: "agro" })).toEqual(["padi"]);
    expect(await slugs({ type: "produk" })).toEqual(["padi", "surya"]);
    expect(await slugs({ year: 2024 })).toEqual(["biogas", "padi"]);
    expect(await slugs({ hasIp: true })).toEqual(["padi", "surya"]);

    expect(await slugs({ category: "energi", year: 2024 })).toEqual(["biogas"]);
    expect(await slugs({ faculty: "teknik", type: "produk", hasIp: true })).toEqual(["surya"]);
    expect(await slugs({ category: "pangan", faculty: "teknik", year: 2023 })).toEqual([]);
  });

  it("total mengikuti penyaring dan paginasi memotong hasil yang sudah tersaring", async () => {
    await seed();
    const page1 = await provider().search(query({ category: "pangan", perPage: 1, page: 1 }));
    const page2 = await provider().search(query({ category: "pangan", perPage: 1, page: 2 }));
    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);
    expect(page1.items[0].slug).not.toBe(page2.items[0].slug);
  });

  it("draft tidak pernah ikut walau atributnya cocok", async () => {
    await seed();
    expect(await slugs({ category: "energi", hasIp: true, year: 2024, type: "produk", faculty: "teknik" })).toEqual([]);
    expect(await slugs({ year: 2024, hasIp: true })).toEqual(["padi"]);
  });

  it("slug tidak dikenal atau berisi SQL hanya menghasilkan daftar kosong, tanpa galat", async () => {
    await seed();
    for (const bad of ["tidak-ada", "' or 1=1 --", "x'; drop table innovations; --", "%", "_"]) {
      expect(await slugs({ category: bad })).toEqual([]);
      expect(await slugs({ faculty: bad })).toEqual([]);
      expect(await slugs({ studyProgram: bad })).toEqual([]);
      expect(await slugs({ type: bad })).toEqual([]);
    }
    expect((await provider().search(query())).total).toBe(4);
  });

  it("penyaring digabung dengan pencarian kata kunci", async () => {
    await seed();
    expect(await slugs({ q: "surya", category: "energi" })).toEqual(["surya"]);
    expect(await slugs({ q: "surya", category: "pangan" })).toEqual([]);
  });

  it("urutan: terbaru memakai tanggal terbit; relevansi memakai peringkat teks", async () => {
    const mk = (slug: string, title: string, summary: string, publishedAt: string) =>
      ctx.db.insert(innovations).values({
        slug,
        title,
        summary,
        submittedBy: owner,
        status: "published",
        publishedAt: new Date(publishedAt),
      });
    // "lama" cocok kuat (judul), "baru" cocok lemah (hanya ringkasan) tetapi lebih baru.
    await mk("lama", "[DUMMY] Biogas", "[DUMMY] ringkasan", "2024-01-01T00:00:00Z");
    await mk("baru", "[DUMMY] Alat lain", "[DUMMY] memakai biogas sebagai bahan", "2025-06-01T00:00:00Z");

    const relevance = await provider().search(query({ q: "biogas", sort: "relevance" }));
    const newest = await provider().search(query({ q: "biogas", sort: "newest" }));
    expect(relevance.items.map((i) => i.slug)).toEqual(["lama", "baru"]);
    expect(newest.items.map((i) => i.slug)).toEqual(["baru", "lama"]);
  });
});

describe("opsi penyaring (facets)", () => {
  it("kosong bila belum ada inovasi terbit", async () => {
    expect(await provider().facets()).toEqual({ categories: [], faculties: [], studyPrograms: [], types: [], years: [] });
  });

  it("hanya opsi yang punya inovasi terbit, dengan jumlah yang benar dan urutan sesuai", async () => {
    await seed();
    await ctx.db.insert(categories).values({ slug: "kosong", name: "[DUMMY] Tanpa Inovasi" });

    const f = await provider().facets();
    expect(f.categories).toEqual([
      { slug: "energi", name: "[DUMMY] Energi", count: 2 },
      { slug: "pangan", name: "[DUMMY] Pangan", count: 2 },
    ]);
    expect(f.faculties.map((x) => [x.slug, x.count])).toEqual([["pertanian", 1], ["teknik", 2]]);
    expect(f.studyPrograms.map((x) => [x.slug, x.count, x.facultyName])).toEqual([
      ["agro", 1, "[DUMMY] Pertanian"],
      ["informatika", 2, "[DUMMY] Teknik"],
    ]);
    expect(f.types.map((x) => [x.slug, x.count])).toEqual([["produk", 2], ["model", 1]]);
    expect(f.years).toEqual([{ year: 2024, count: 2 }, { year: 2023, count: 1 }]);
  });

  it("draft tidak dihitung, dan item acuan nonaktif tidak ditawarkan", async () => {
    const { cEnergi, fTek } = await seed();
    await ctx.db.update(categories).set({ isActive: false }).where(eq(categories.id, cEnergi.id));
    await ctx.db.update(faculties).set({ isActive: false }).where(eq(faculties.id, fTek.id));

    const f = await provider().facets();
    expect(f.categories.map((x) => x.slug)).toEqual(["pangan"]);
    expect(f.faculties.map((x) => x.slug)).toEqual(["pertanian"]);
    // Tahun 2024 dimiliki 2 terbit + 1 draft; draft tidak dihitung.
    expect(f.years.find((y) => y.year === 2024)?.count).toBe(2);
  });
});
