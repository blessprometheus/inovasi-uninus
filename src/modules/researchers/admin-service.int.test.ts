import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/modules/auth/authorize";
import { ROLE_PERMISSIONS, type RoleCode } from "@/modules/auth/permissions";
import { createInnovationService } from "@/modules/innovations/service";
import type { ServiceResult } from "@/modules/innovations/service-core";
import { auditLogs, categories, faculties, researchers, studyPrograms, users } from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createAdminResearcherService } from "./admin-service";
import { createPgResearcherProvider } from "./pg-provider";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
const onPublicChange = vi.fn();
const svc = () => createAdminResearcherService(ctx.db, { onPublicChange });

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
  onPublicChange.mockClear();
});

let counter = 0;
async function makeActor(role: RoleCode): Promise<AuthUser> {
  const n = ++counter;
  const [u] = await ctx.db
    .insert(users)
    .values({ ssoSubject: `s-${n}`, email: `u${n}@uninus.ac.id`, name: `[DUMMY] ${role} ${n}` })
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

async function makeFaculty(name = "[DUMMY] Fakultas Teknik") {
  const [f] = await ctx.db.insert(faculties).values({ slug: `f-${++counter}`, name }).returning();
  return f.id;
}

describe("CRUD peneliti oleh operator", () => {
  it("membuat peneliti tanpa akun, slug otomatis unik, tampil di direktori publik", async () => {
    const op = await makeActor("operator");
    const facultyId = await makeFaculty();
    const a = ok(
      await svc().create(op, {
        fullName: "[DUMMY] Siti Aminah",
        position: "[DUMMY] Lektor",
        facultyId,
        externalLinks: [{ label: "Google Scholar", url: "https://scholar.google.com/x" }],
      }),
    );
    const b = ok(await svc().create(op, { fullName: "[DUMMY] Siti Aminah" }));
    expect(a.slug).toBe("dummy-siti-aminah");
    expect(b.slug).toBe("dummy-siti-aminah-2");
    expect(a.isPublic).toBe(true);
    expect(a.externalLinks).toEqual([{ label: "Google Scholar", url: "https://scholar.google.com/x" }]);

    const [row] = await ctx.db.select().from(researchers).where(eq(researchers.id, a.id));
    expect(row.userId).toBeNull();
    expect(row.identifier).toBeNull();
    expect(onPublicChange).toHaveBeenCalledTimes(2);

    const pub = await createPgResearcherProvider(ctx.db).search({ page: 1, perPage: 10 });
    expect(pub.total).toBe(2);
  });

  it("profil non-publik tidak muncul di direktori publik tetapi tetap ada di daftar admin", async () => {
    const op = await makeActor("operator");
    const hidden = ok(await svc().create(op, { fullName: "[DUMMY] Disembunyikan", isPublic: false }));
    expect((await createPgResearcherProvider(ctx.db).search({ page: 1, perPage: 10 })).total).toBe(0);
    expect(ok(await svc().list(op, { page: 1, perPage: 10 })).items.map((r) => r.id)).toEqual([hidden.id]);
  });

  it("memperbarui sebagian field, slug tetap, dan audit hanya mencatat nama field", async () => {
    const op = await makeActor("operator");
    const created = ok(await svc().create(op, { fullName: "[DUMMY] Nama Lama", bio: "[DUMMY] Bio" }));
    const updated = ok(await svc().update(op, created.id, { fullName: "[DUMMY] Nama Baru", position: null }));
    expect(updated.fullName).toBe("[DUMMY] Nama Baru");
    expect(updated.slug).toBe(created.slug);
    expect(updated.bio).toBe("[DUMMY] Bio");

    const logs = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "researcher.update"));
    expect(JSON.stringify(logs[0].changes)).toBe(JSON.stringify({ fields: ["fullName", "position"] }));
    expect(JSON.stringify(logs[0].changes)).not.toContain("Nama Baru");
  });

  it("pencarian nama tidak peka huruf besar dan karakter LIKE di-escape", async () => {
    const op = await makeActor("operator");
    await svc().create(op, { fullName: "[DUMMY] Budi Santoso" });
    await svc().create(op, { fullName: "[DUMMY] Ani 100% Rajin" });
    expect(ok(await svc().list(op, { q: "budi", page: 1, perPage: 10 })).total).toBe(1);
    expect(ok(await svc().list(op, { q: "%", page: 1, perPage: 10 })).total).toBe(1);
  });

  it("program studi harus ada dan sesuai fakultas yang dipilih", async () => {
    const op = await makeActor("operator");
    const f1 = await makeFaculty("[DUMMY] F1");
    const f2 = await makeFaculty("[DUMMY] F2");
    const [sp] = await ctx.db.insert(studyPrograms).values({ slug: "sp-1", name: "[DUMMY] Prodi", facultyId: f1 }).returning();

    ok(await svc().create(op, { fullName: "[DUMMY] Cocok", facultyId: f1, studyProgramId: sp.id }));
    const bad = fails(await svc().create(op, { fullName: "[DUMMY] Tidak Cocok", facultyId: f2, studyProgramId: sp.id }), "VALIDATION_ERROR");
    expect(bad.ok ? [] : bad.details?.map((d) => d.field)).toEqual(["studyProgramId"]);
    fails(await svc().create(op, { fullName: "[DUMMY] Fakultas Hantu", facultyId: crypto.randomUUID() }), "VALIDATION_ERROR");

    // Pembaruan memeriksa gabungan nilai lama dan baru.
    const c = ok(await svc().create(op, { fullName: "[DUMMY] Pindah", facultyId: f1, studyProgramId: sp.id }));
    fails(await svc().update(op, c.id, { facultyId: f2 }), "VALIDATION_ERROR");
  });

  it("menolak input berbahaya atau tidak dikenal: userId, slug, NIDN/NIP, tautan javascript:", async () => {
    const op = await makeActor("operator");
    const victim = await makeActor("researcher");
    fails(await svc().create(op, { fullName: "[DUMMY] A", userId: victim.id }), "VALIDATION_ERROR");
    fails(await svc().create(op, { fullName: "[DUMMY] A", slug: "kuasai" }), "VALIDATION_ERROR");
    fails(await svc().create(op, { fullName: "[DUMMY] A", identifier: "0412345678" }), "VALIDATION_ERROR");
    fails(await svc().create(op, { fullName: "[DUMMY] A", externalLinks: [{ label: "x", url: "javascript:alert(1)" }] }), "VALIDATION_ERROR");
    fails(await svc().create(op, { fullName: "A" }), "VALIDATION_ERROR");
    fails(await svc().create(op, { fullName: "[DUMMY] A", externalLinks: Array.from({ length: 6 }, () => ({ label: "x", url: "https://a.id" })) }), "VALIDATION_ERROR");
    expect(await ctx.db.select().from(researchers)).toHaveLength(0);
  });

  it("tidak bisa dihapus selama masih tercantum di inovasi, dan bisa setelah dilepas", async () => {
    const op = await makeActor("operator");
    const r = ok(await svc().create(op, { fullName: "[DUMMY] Ketua Tim" }));
    const [cat] = await ctx.db.insert(categories).values({ slug: "k", name: "[DUMMY] K" }).returning();
    const inv = ok(
      await createInnovationService(ctx.db).createDraft(op, {
        title: "[DUMMY] Inovasi Bertim",
        summary: "[DUMMY] Ringkasan inovasi yang cukup panjang untuk lolos validasi.",
        categoryIds: [cat.id],
        leadResearcherId: r.id,
      }),
    );
    expect(ok(await svc().get(op, r.id)).innovationCount).toBe(1);

    fails(await svc().remove(op, r.id, { reason: "Salah input" }), "CONFLICT");
    ok(await createInnovationService(ctx.db).update(op, inv.id, { leadResearcherId: null }));
    ok(await svc().remove(op, r.id, { reason: "Salah input" }));
    fails(await svc().get(op, r.id), "NOT_FOUND");
    fails(await svc().remove(op, r.id, { reason: "Lagi" }), "NOT_FOUND");
  });

  it("hapus mewajibkan alasan", async () => {
    const op = await makeActor("operator");
    const r = ok(await svc().create(op, { fullName: "[DUMMY] Hapus Aku" }));
    fails(await svc().remove(op, r.id, {}), "VALIDATION_ERROR");
    fails(await svc().remove(op, r.id, { reason: "ab" }), "VALIDATION_ERROR");
  });
});

describe("akses", () => {
  it("peran tanpa researcher.manage mendapat 404 di semua operasi, tanpa membocorkan data", async () => {
    const op = await makeActor("operator");
    const dosen = await makeActor("researcher");
    const r = ok(await svc().create(op, { fullName: "[DUMMY] Rahasia" }));

    fails(await svc().list(dosen, { page: 1, perPage: 10 }), "NOT_FOUND");
    fails(await svc().get(dosen, r.id), "NOT_FOUND");
    fails(await svc().create(dosen, { fullName: "[DUMMY] Palsu" }), "NOT_FOUND");
    fails(await svc().update(dosen, r.id, { fullName: "[DUMMY] Dibajak" }), "NOT_FOUND");
    fails(await svc().remove(dosen, r.id, { reason: "iseng" }), "NOT_FOUND");
    expect(ok(await svc().get(op, r.id)).fullName).toBe("[DUMMY] Rahasia");
  });

  it("id bukan UUID atau tidak ada mengembalikan 404", async () => {
    const op = await makeActor("operator");
    fails(await svc().get(op, "bukan-uuid"), "NOT_FOUND");
    fails(await svc().get(op, crypto.randomUUID()), "NOT_FOUND");
  });
});
