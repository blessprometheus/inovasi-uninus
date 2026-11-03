import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { faculties, innovationMembers, innovations, researchers, users } from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createPgResearcherProvider, safeExternalLinks } from "./pg-provider";

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

async function addResearcher(slug: string, over: Partial<typeof researchers.$inferInsert> = {}) {
  const [r] = await ctx.db
    .insert(researchers)
    .values({ slug, fullName: `[DUMMY] ${slug}`, ...over })
    .returning();
  return r;
}

async function addInnovation(slug: string, status: "published" | "draft" = "published") {
  const [i] = await ctx.db
    .insert(innovations)
    .values({
      slug,
      title: `[DUMMY] ${slug}`,
      summary: "[DUMMY] Ringkasan",
      submittedBy: owner,
      status,
      publishedAt: status === "published" ? new Date("2025-01-01T00:00:00Z") : null,
    })
    .returning();
  return i;
}

const provider = () => createPgResearcherProvider(ctx.db);

describe("safeExternalLinks", () => {
  it("hanya meloloskan http/https dan membuang sisanya", () => {
    expect(
      safeExternalLinks({
        scholar: "https://scholar.google.com/x",
        jahat: "javascript:alert(1)",
        data: "data:text/html,<script>",
        rusak: "bukan url",
        angka: 5,
      }),
    ).toEqual([{ label: "scholar", url: "https://scholar.google.com/x" }]);
  });

  it("nilai bukan objek menghasilkan daftar kosong", () => {
    for (const v of [null, undefined, "teks", 3, ["https://a.test"]]) {
      expect(safeExternalLinks(v)).toEqual([]);
    }
  });
});

describe("peneliti PostgreSQL", () => {
  it("hanya profil publik dan tidak terhapus yang tampil", async () => {
    await addResearcher("publik");
    await addResearcher("privat", { isPublic: false });
    await addResearcher("terhapus", { deletedAt: new Date() });

    const p = provider();
    expect((await p.search({ page: 1, perPage: 12 })).items.map((r) => r.slug)).toEqual(["publik"]);
    expect(await p.getBySlug("publik")).not.toBeNull();
    expect(await p.getBySlug("privat")).toBeNull();
    expect(await p.getBySlug("terhapus")).toBeNull();
    expect((await p.listSlugs()).map((s) => s.slug)).toEqual(["publik"]);
  });

  it("NIDN/NIP tidak pernah ikut keluar", async () => {
    await addResearcher("a", { identifier: "0412345678" });
    const p = provider();
    const [item] = (await p.search({ page: 1, perPage: 12 })).items;
    const detail = await p.getBySlug("a");
    expect(JSON.stringify(item)).not.toContain("0412345678");
    expect(JSON.stringify(detail)).not.toContain("0412345678");
  });

  it("jumlah inovasi dan daftar inovasi hanya dari yang terbit", async () => {
    const fac = (await ctx.db.insert(faculties).values({ slug: "f1", name: "[DUMMY] Fakultas" }).returning())[0];
    const r = await addResearcher("r", { facultyId: fac.id, position: "[DUMMY] Lektor" });
    const terbit = await addInnovation("terbit");
    const draft = await addInnovation("draft", "draft");
    await ctx.db.insert(innovationMembers).values([
      { innovationId: terbit.id, researcherId: r.id, role: "lead" },
      { innovationId: draft.id, researcherId: r.id, role: "lead" },
    ]);

    const p = provider();
    const [item] = (await p.search({ page: 1, perPage: 12 })).items;
    expect(item).toMatchObject({ slug: "r", innovationCount: 1, facultyName: "[DUMMY] Fakultas", position: "[DUMMY] Lektor" });

    const detail = await p.getBySlug("r");
    expect(detail?.innovations.map((i) => i.slug)).toEqual(["terbit"]);
  });

  it("pencarian nama: tidak peka huruf besar/kecil dan % bukan wildcard", async () => {
    await addResearcher("siti-aminah", { fullName: "[DUMMY] Siti Aminah" });
    await addResearcher("budi", { fullName: "[DUMMY] Budi" });
    const p = provider();
    expect((await p.search({ q: "AMINAH", page: 1, perPage: 12 })).items.map((r) => r.slug)).toEqual(["siti-aminah"]);
    expect((await p.search({ q: "%", page: 1, perPage: 12 })).total).toBe(0);
  });

  it("tautan eksternal berbahaya dibuang di profil", async () => {
    await addResearcher("a", { externalLinks: { scholar: "https://scholar.google.com/x", xss: "javascript:alert(1)" } });
    const d = await provider().getBySlug("a");
    expect(d?.externalLinks).toEqual([{ label: "scholar", url: "https://scholar.google.com/x" }]);
  });
});
