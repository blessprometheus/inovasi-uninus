import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@/modules/auth/authorize";
import { ROLE_PERMISSIONS, type RoleCode } from "@/modules/auth/permissions";
import { createInnovationService } from "@/modules/innovations/service";
import type { ServiceResult } from "@/modules/innovations/service-core";
import { innovations, researchers, users } from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createTaxonomyService } from "./service";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
const svc = () => createTaxonomyService(ctx.db);

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
});

let n = 0;
async function actorWith(role: RoleCode): Promise<AuthUser & { researcherId: string }> {
  n++;
  const [u] = await ctx.db.insert(users).values({ ssoSubject: `s${n}`, email: `u${n}@uninus.ac.id`, name: "[DUMMY]" }).returning();
  const [r] = await ctx.db.insert(researchers).values({ userId: u.id, slug: `p-${n}`, fullName: "[DUMMY]" }).returning();
  return { id: u.id, permissions: new Set(ROLE_PERMISSIONS[role]), researcherId: r.id };
}

function ok<T>(r: ServiceResult<T>): T {
  if (!r.ok) throw new Error(`Diharapkan ok, dapat ${r.code}: ${r.message}`);
  return r.data;
}
function fails<T>(r: ServiceResult<T>, code: string) {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("tidak mungkin");
  expect(r.code).toBe(code);
}

describe("taksonomi: buat dan ubah", () => {
  it("membuat tiap jenis dengan slug otomatis dan unik; urutan sesuai sortOrder", async () => {
    const op = await actorWith("operator");
    const f = ok(await svc().create(op, "faculties", { name: "[DUMMY] Fakultas Uji" }));
    expect(f).toMatchObject({ slug: "dummy-fakultas-uji", isActive: true, innovationCount: 0 });
    expect(ok(await svc().create(op, "faculties", { name: "[DUMMY] Fakultas Uji" })).slug).toBe("dummy-fakultas-uji-2");

    const sp = ok(await svc().create(op, "study-programs", { facultyId: f.id, name: "[DUMMY] Prodi Uji" }));
    expect(sp.facultyId).toBe(f.id);

    ok(await svc().create(op, "categories", { name: "[DUMMY] B", sortOrder: 2 }));
    const a = ok(await svc().create(op, "categories", { name: "[DUMMY] A", sortOrder: 1, description: "Uji" }));
    expect(a.description).toBe("Uji");
    expect(ok(await svc().list(op, "categories")).map((c) => c.name)).toEqual(["[DUMMY] A", "[DUMMY] B"]);

    expect(ok(await svc().create(op, "innovation-types", { name: "[DUMMY] Jenis", sortOrder: 1 })).sortOrder).toBe(1);
  });

  it("hanya taxonomy.manage: dosen ditolak dan tidak ada yang tertulis", async () => {
    const dosen = await actorWith("researcher");
    fails(await svc().create(dosen, "categories", { name: "[DUMMY] Liar" }), "FORBIDDEN");
    fails(await svc().list(dosen, "categories"), "FORBIDDEN");
    expect(await svc().listPublic("categories")).toEqual([]);
  });

  it("validasi: nama pendek, field tak dikenal (slug), fakultas tak ada, id aneh", async () => {
    const op = await actorWith("operator");
    fails(await svc().create(op, "categories", { name: "x" }), "VALIDATION_ERROR");
    fails(await svc().create(op, "categories", { name: "[DUMMY] Baik", slug: "curang" }), "VALIDATION_ERROR");
    fails(await svc().create(op, "study-programs", { name: "[DUMMY] P" }), "VALIDATION_ERROR");
    fails(
      await svc().create(op, "study-programs", { name: "[DUMMY] Prodi", facultyId: "01a1a48e-b38f-71da-829f-b542da9161af" }),
      "VALIDATION_ERROR",
    );
    fails(await svc().update(op, "categories", "bukan-uuid", { name: "[DUMMY] X" }), "NOT_FOUND");
    fails(await svc().update(op, "categories", "01a1a48e-b38f-71da-829f-b542da9161af", { name: "[DUMMY] X" }), "NOT_FOUND");
    expect(await svc().listPublic("study-programs")).toEqual([]);
  });

  it("ubah nama tidak mengubah slug; slug dan fakultas tidak bisa diubah lewat patch", async () => {
    const op = await actorWith("operator");
    const f = ok(await svc().create(op, "faculties", { name: "[DUMMY] Fakultas Lama" }));
    const u = ok(await svc().update(op, "faculties", f.id, { name: "[DUMMY] Fakultas Baru" }));
    expect(u).toMatchObject({ name: "[DUMMY] Fakultas Baru", slug: f.slug });
    fails(await svc().update(op, "faculties", f.id, { slug: "ganti" }), "VALIDATION_ERROR");

    const sp = ok(await svc().create(op, "study-programs", { facultyId: f.id, name: "[DUMMY] Prodi" }));
    fails(await svc().update(op, "study-programs", sp.id, { facultyId: f.id }), "VALIDATION_ERROR");
  });
});

describe("taksonomi: nonaktif dan jumlah", () => {
  it("item nonaktif hilang dari daftar publik, tetap di admin, dan tidak bisa dipilih kategori baru", async () => {
    const op = await actorWith("operator");
    const dosen = await actorWith("researcher");
    const cat = ok(await svc().create(op, "categories", { name: "[DUMMY] Kategori Aktif" }));
    expect((await svc().listPublic("categories")).map((c) => c.id)).toEqual([cat.id]);

    ok(await svc().update(op, "categories", cat.id, { isActive: false }));
    expect(await svc().listPublic("categories")).toEqual([]);
    expect(ok(await svc().list(op, "categories")).map((c) => c.isActive)).toEqual([false]);

    const draft = await createInnovationService(ctx.db).createDraft(dosen, {
      title: "[DUMMY] Memakai kategori nonaktif",
      summary: "[DUMMY] Ringkasan inovasi yang cukup panjang untuk lolos validasi.",
      categoryIds: [cat.id],
    });
    fails(draft, "VALIDATION_ERROR");
  });

  it("innovationCount hanya menghitung inovasi terbit dan tidak terhapus", async () => {
    const op = await actorWith("operator");
    const f = ok(await svc().create(op, "faculties", { name: "[DUMMY] Fakultas" }));
    const c = ok(await svc().create(op, "categories", { name: "[DUMMY] Kategori" }));
    const make = async (slug: string, over: Partial<typeof innovations.$inferInsert>) => {
      const [i] = await ctx.db
        .insert(innovations)
        .values({ slug, title: `[DUMMY] ${slug}`, summary: "[DUMMY] r", submittedBy: op.id, facultyId: f.id, ...over })
        .returning();
      return i;
    };
    const pub = await make("terbit", { status: "published", publishedAt: new Date() });
    await make("draft", {});
    await make("terhapus", { status: "published", publishedAt: new Date(), deletedAt: new Date() });
    const { innovationCategories } = await import("@/platform/db/schema");
    await ctx.db.insert(innovationCategories).values({ innovationId: pub.id, categoryId: c.id });

    expect((await svc().listPublic("faculties"))[0].innovationCount).toBe(1);
    expect((await svc().listPublic("categories"))[0].innovationCount).toBe(1);
  });
});
