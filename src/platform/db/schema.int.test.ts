import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDb, setupTestDb } from "./testing";
import {
  innovationCategories,
  innovationFiles,
  innovationMembers,
  innovations,
  publications,
  categories,
  researchers,
  users,
} from "./schema";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
});

async function makeUser(email = "dosen@uninus.ac.id") {
  const [u] = await ctx.db
    .insert(users)
    .values({ ssoSubject: `sub-${email}`, email, name: "[DUMMY] Dosen" })
    .returning();
  return u;
}

async function makeInnovation(ownerId: string, slug = "inovasi-uji") {
  const [i] = await ctx.db
    .insert(innovations)
    .values({ slug, title: "[DUMMY] Inovasi uji", summary: "Ringkasan uji", submittedBy: ownerId })
    .returning();
  return i;
}

async function makeResearcher(slug: string) {
  const [r] = await ctx.db.insert(researchers).values({ slug, fullName: `[DUMMY] ${slug}` }).returning();
  return r;
}

describe("skema database: integritas", () => {
  it("email harus huruf kecil dan unik", async () => {
    await expect(
      ctx.db.insert(users).values({ ssoSubject: "a", email: "Besar@uninus.ac.id", name: "x" }),
    ).rejects.toThrow();
    await makeUser("a@uninus.ac.id");
    await expect(
      ctx.db.insert(users).values({ ssoSubject: "b", email: "a@uninus.ac.id", name: "x" }),
    ).rejects.toThrow();
  });

  it("inovasi baru berstatus draft, slug unik, tahun dibatasi", async () => {
    const u = await makeUser();
    const i = await makeInnovation(u.id);
    expect(i.status).toBe("draft");
    expect(i.isFeatured).toBe(false);
    await expect(makeInnovation(u.id)).rejects.toThrow();
    await expect(
      ctx.db.insert(innovations).values({ slug: "x", title: "t", summary: "s", year: 1800, submittedBy: u.id }),
    ).rejects.toThrow();
  });

  it("hanya satu ketua peneliti per inovasi", async () => {
    const u = await makeUser();
    const i = await makeInnovation(u.id);
    const r1 = await makeResearcher("r1");
    const r2 = await makeResearcher("r2");
    await ctx.db.insert(innovationMembers).values({ innovationId: i.id, researcherId: r1.id, role: "lead" });
    await expect(
      ctx.db.insert(innovationMembers).values({ innovationId: i.id, researcherId: r2.id, role: "lead" }),
    ).rejects.toThrow();
    await ctx.db.insert(innovationMembers).values({ innovationId: i.id, researcherId: r2.id, role: "member" });
  });

  it("hanya satu gambar sampul per inovasi, dan visibilitas default terbatas", async () => {
    const u = await makeUser();
    const i = await makeInnovation(u.id);
    const [f] = await ctx.db
      .insert(innovationFiles)
      .values({ innovationId: i.id, kind: "image", storageKey: "ab/1", isCover: true })
      .returning();
    expect(f.visibility).toBe("restricted");
    await expect(
      ctx.db.insert(innovationFiles).values({ innovationId: i.id, kind: "image", storageKey: "ab/2", isCover: true }),
    ).rejects.toThrow();
  });

  it("berkas harus punya sumber yang sesuai jenisnya, tautan video hanya http/https", async () => {
    const u = await makeUser();
    const i = await makeInnovation(u.id);
    await expect(
      ctx.db.insert(innovationFiles).values({ innovationId: i.id, kind: "document" }),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert(innovationFiles).values({ innovationId: i.id, kind: "video_link", url: "javascript:alert(1)" }),
    ).rejects.toThrow();
    await ctx.db
      .insert(innovationFiles)
      .values({ innovationId: i.id, kind: "video_link", url: "https://contoh.id/video" });
  });

  it("tautan publikasi hanya http/https", async () => {
    const u = await makeUser();
    const i = await makeInnovation(u.id);
    await expect(
      ctx.db.insert(publications).values({ innovationId: i.id, title: "t", url: "javascript:alert(1)" }),
    ).rejects.toThrow();
    await ctx.db.insert(publications).values({ innovationId: i.id, title: "t", url: "https://doi.org/10.1/x" });
  });

  it("menghapus inovasi ikut menghapus anak (anggota, kategori, berkas)", async () => {
    const u = await makeUser();
    const i = await makeInnovation(u.id);
    const r = await makeResearcher("r1");
    const [c] = await ctx.db.insert(categories).values({ slug: "kat", name: "[DUMMY] Kategori" }).returning();
    await ctx.db.insert(innovationMembers).values({ innovationId: i.id, researcherId: r.id, role: "lead" });
    await ctx.db.insert(innovationCategories).values({ innovationId: i.id, categoryId: c.id });
    await ctx.db.delete(innovations).where(eq(innovations.id, i.id));
    const left = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(innovationMembers);
    expect(left[0].n).toBe(0);
  });

  it("search_vector terisi otomatis dan dapat dicari", async () => {
    const u = await makeUser();
    await ctx.db.insert(innovations).values({
      slug: "padi",
      title: "Pupuk organik cair untuk padi",
      summary: "Meningkatkan hasil panen",
      submittedBy: u.id,
    });
    const hit = await ctx.db
      .select({ slug: innovations.slug })
      .from(innovations)
      .where(sql`${innovations.searchVector} @@ plainto_tsquery('simple', 'pupuk')`);
    expect(hit.map((h) => h.slug)).toEqual(["padi"]);
    const miss = await ctx.db
      .select({ slug: innovations.slug })
      .from(innovations)
      .where(sql`${innovations.searchVector} @@ plainto_tsquery('simple', 'robotika')`);
    expect(miss).toEqual([]);
  });

  it("pencarian trigram toleran salah ketik pada judul", async () => {
    const u = await makeUser();
    await makeInnovation(u.id, "pupuk");
    const rows = await ctx.db
      .select({ slug: innovations.slug })
      .from(innovations)
      .where(sql`similarity(${innovations.title}, '[DUMMY] Inovasi ujj') > 0.3`);
    expect(rows.length).toBe(1);
  });
});
