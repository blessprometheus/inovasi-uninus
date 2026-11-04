import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@/modules/auth/authorize";
import { ROLE_PERMISSIONS, type RoleCode } from "@/modules/auth/permissions";
import {
  auditLogs,
  categories,
  innovationMembers,
  innovations,
  researchers,
  statusHistories,
  users,
} from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createInnovationService, type ServiceResult } from "./service";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
const service = () => createInnovationService(ctx.db);

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetTestDb(ctx.db);
});

let counter = 0;
async function makeActor(role: RoleCode = "researcher", withProfile = true) {
  const n = ++counter;
  const [u] = await ctx.db
    .insert(users)
    .values({ ssoSubject: `s-${n}`, email: `u${n}@uninus.ac.id`, name: `[DUMMY] Pengguna ${n}` })
    .returning();
  let researcherId: string | null = null;
  if (withProfile) {
    const [r] = await ctx.db
      .insert(researchers)
      .values({ userId: u.id, slug: `peneliti-${n}`, fullName: `[DUMMY] Peneliti ${n}` })
      .returning();
    researcherId = r.id;
  }
  const actor: AuthUser = { id: u.id, permissions: new Set(ROLE_PERMISSIONS[role]) };
  return { actor, userId: u.id, researcherId };
}

async function makeCategory(name = "[DUMMY] Kategori") {
  const [c] = await ctx.db
    .insert(categories)
    .values({ slug: `kat-${++counter}`, name })
    .returning();
  return c.id;
}

const valid = (over: Record<string, unknown> = {}) => ({
  title: "[DUMMY] Pengering Padi Tenaga Surya",
  summary: "[DUMMY] Ringkasan inovasi yang cukup panjang untuk lolos validasi.",
  ...over,
});

function expectOk<T>(r: ServiceResult<T>): T {
  if (!r.ok) throw new Error(`Diharapkan ok, dapat ${r.code}: ${r.message}`);
  return r.data;
}

function expectFail<T>(r: ServiceResult<T>, code: string) {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("tidak mungkin");
  expect(r.code).toBe(code);
  return r;
}

describe("buat draft", () => {
  it("membuat draft dengan slug, ketua default (profil sendiri), riwayat, dan audit log", async () => {
    const me = await makeActor();
    const cat = await makeCategory();
    const d = expectOk(await service().createDraft(me.actor, valid({ categoryIds: [cat], year: 2024 })));

    expect(d).toMatchObject({
      status: "draft",
      isOwner: true,
      slug: "dummy-pengering-padi-tenaga-surya",
      leadResearcherId: me.researcherId,
      categoryIds: [cat],
      year: 2024,
      memberResearcherIds: [],
    });
    const hist = await ctx.db.select().from(statusHistories).where(eq(statusHistories.innovationId, d.id));
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ fromStatus: null, toStatus: "draft", actorId: me.userId });
    const audit = await ctx.db.select().from(auditLogs);
    expect(audit.map((a) => a.action)).toEqual(["innovation.create"]);
  });

  it("judul yang sama menghasilkan slug unik", async () => {
    const me = await makeActor();
    const a = expectOk(await service().createDraft(me.actor, valid()));
    const b = expectOk(await service().createDraft(me.actor, valid()));
    expect(b.slug).toBe(`${a.slug}-2`);
  });

  it("ketua eksplisit null tidak diganti profil sendiri; anggota yang sama dengan ketua dibuang", async () => {
    const me = await makeActor();
    const kosong = expectOk(await service().createDraft(me.actor, valid({ leadResearcherId: null })));
    expect(kosong.leadResearcherId).toBeNull();

    const other = await makeActor("researcher");
    const d = expectOk(
      await service().createDraft(me.actor, valid({ memberResearcherIds: [other.researcherId, me.researcherId] })),
    );
    expect(d.leadResearcherId).toBe(me.researcherId);
    expect(d.memberResearcherIds).toEqual([other.researcherId]);
  });

  it("menolak input tidak valid beserta detail per-field, tanpa menulis apa pun", async () => {
    const me = await makeActor();
    const r = expectFail(await service().createDraft(me.actor, { title: "abc", summary: "pendek" }), "VALIDATION_ERROR");
    expect(r.details?.map((d) => d.field).sort()).toEqual(["summary", "title"]);
    expect(await ctx.db.select().from(innovations)).toHaveLength(0);
  });

  it("menolak field yang tidak boleh dikirim klien (status, slug, pemilik)", async () => {
    const me = await makeActor();
    for (const extra of [{ status: "published" }, { slug: "x" }, { submittedBy: me.userId }, { isFeatured: true }]) {
      expectFail(await service().createDraft(me.actor, valid(extra)), "VALIDATION_ERROR");
    }
    expect(await ctx.db.select().from(innovations)).toHaveLength(0);
  });

  it("rujukan yang tidak ada (kategori, peneliti, fakultas) ditolak dan dibatalkan seluruhnya", async () => {
    const me = await makeActor();
    const ghost = "01a1a48e-b38f-71da-829f-b542da9161af";
    expectFail(await service().createDraft(me.actor, valid({ categoryIds: [ghost] })), "VALIDATION_ERROR");
    expectFail(await service().createDraft(me.actor, valid({ memberResearcherIds: [ghost] })), "VALIDATION_ERROR");
    expectFail(await service().createDraft(me.actor, valid({ facultyId: ghost })), "VALIDATION_ERROR");
    expect(await ctx.db.select().from(innovations)).toHaveLength(0);
    expect(await ctx.db.select().from(innovationMembers)).toHaveLength(0);
  });

  it("tanpa permission innovation.create ditolak", async () => {
    const me = await makeActor();
    const tamu: AuthUser = { id: me.userId, permissions: new Set() };
    expectFail(await service().createDraft(tamu, valid()), "FORBIDDEN");
  });
});

describe("baca dan daftar", () => {
  it("pemilik membaca miliknya; orang lain dan id aneh mendapat NOT_FOUND", async () => {
    const a = await makeActor();
    const b = await makeActor();
    const d = expectOk(await service().createDraft(a.actor, valid()));

    expect(expectOk(await service().getOwn(a.actor, d.id)).title).toBe(d.title);
    expectFail(await service().getOwn(b.actor, d.id), "NOT_FOUND");
    expectFail(await service().getOwn(a.actor, "bukan-uuid"), "NOT_FOUND");
    expectFail(await service().getOwn(a.actor, "01a1a48e-b38f-71da-829f-b542da9161af"), "NOT_FOUND");
  });

  it("daftar hanya milik sendiri + yang menjadikan saya anggota, tanpa yang terhapus; filter status dan paginasi", async () => {
    const a = await makeActor();
    const b = await makeActor();
    const mine1 = expectOk(await service().createDraft(a.actor, valid({ title: "[DUMMY] Milik A satu" })));
    expectOk(await service().createDraft(a.actor, valid({ title: "[DUMMY] Milik A dua" })));
    const deleted = expectOk(await service().createDraft(a.actor, valid({ title: "[DUMMY] Milik A terhapus" })));
    expectOk(await service().remove(a.actor, deleted.id));
    expectOk(await service().createDraft(b.actor, valid({ title: "[DUMMY] Milik B" })));
    const shared = expectOk(
      await service().createDraft(b.actor, valid({ title: "[DUMMY] B dengan A", memberResearcherIds: [a.researcherId] })),
    );

    const all = expectOk(await service().listOwn(a.actor, { page: 1, perPage: 12 }));
    expect(all.total).toBe(3);
    expect(all.items.map((i) => i.title).sort()).toEqual(["[DUMMY] B dengan A", "[DUMMY] Milik A dua", "[DUMMY] Milik A satu"]);
    expect(all.items.find((i) => i.id === shared.id)?.isOwner).toBe(false);
    expect(all.items.find((i) => i.id === mine1.id)?.isOwner).toBe(true);

    expect(expectOk(await service().listOwn(a.actor, { page: 1, perPage: 12, status: "submitted" })).total).toBe(0);
    const p2 = expectOk(await service().listOwn(a.actor, { page: 2, perPage: 2 }));
    expect(p2.items).toHaveLength(1);
    expect(p2.total).toBe(3);
  });

  it("anggota tim boleh membaca tetapi tidak mengedit, mengajukan, atau menghapus", async () => {
    const owner = await makeActor();
    const member = await makeActor();
    const d = expectOk(await service().createDraft(owner.actor, valid({ memberResearcherIds: [member.researcherId] })));

    const read = expectOk(await service().getOwn(member.actor, d.id));
    expect(read.isOwner).toBe(false);
    expectFail(await service().update(member.actor, d.id, { title: "[DUMMY] Dibajak orang" }), "NOT_FOUND");
    expectFail(await service().submit(member.actor, d.id), "NOT_FOUND");
    expectFail(await service().remove(member.actor, d.id), "NOT_FOUND");
    expect((await ctx.db.select().from(innovations).where(eq(innovations.id, d.id)))[0].title).toBe(d.title);
  });
});

describe("ubah", () => {
  it("patch parsial: field lain tetap, slug tetap walau judul berubah, relasi hanya diganti bila dikirim", async () => {
    const me = await makeActor();
    const cat = await makeCategory();
    const d = expectOk(await service().createDraft(me.actor, valid({ categoryIds: [cat], abstract: "[DUMMY] Abstrak" })));

    const u = expectOk(await service().update(me.actor, d.id, { title: "[DUMMY] Judul baru yang berbeda" }));
    expect(u.title).toBe("[DUMMY] Judul baru yang berbeda");
    expect(u.slug).toBe(d.slug);
    expect(u.abstract).toBe("[DUMMY] Abstrak");
    expect(u.categoryIds).toEqual([cat]);
    expect(u.leadResearcherId).toBe(me.researcherId);

    const cleared = expectOk(await service().update(me.actor, d.id, { abstract: "", categoryIds: [] }));
    expect(cleared.abstract).toBeNull();
    expect(cleared.categoryIds).toEqual([]);
  });

  it("mengganti anggota tanpa menyentuh ketua; ketua yang juga anggota ditolak", async () => {
    const me = await makeActor();
    const m1 = await makeActor();
    const m2 = await makeActor();
    const d = expectOk(await service().createDraft(me.actor, valid({ memberResearcherIds: [m1.researcherId] })));

    const u = expectOk(await service().update(me.actor, d.id, { memberResearcherIds: [m2.researcherId] }));
    expect(u.leadResearcherId).toBe(me.researcherId);
    expect(u.memberResearcherIds).toEqual([m2.researcherId]);

    expectFail(await service().update(me.actor, d.id, { memberResearcherIds: [me.researcherId] }), "VALIDATION_ERROR");
    expect(expectOk(await service().getOwn(me.actor, d.id)).memberResearcherIds).toEqual([m2.researcherId]);
  });

  it("publikasi dan HKI diganti utuh; tautan non-http ditolak", async () => {
    const me = await makeActor();
    const d = expectOk(await service().createDraft(me.actor, valid()));
    const u = expectOk(
      await service().update(me.actor, d.id, {
        publications: [{ title: "[DUMMY] Jurnal", url: "https://example.com/j" }],
        intellectualProperties: [{ kind: "hki", status: "[DUMMY] Terdaftar" }],
      }),
    );
    expect(u.publications).toHaveLength(1);
    expect(u.intellectualProperties[0]).toMatchObject({ kind: "hki", status: "[DUMMY] Terdaftar" });

    expectFail(
      await service().update(me.actor, d.id, { publications: [{ title: "[DUMMY] X", url: "javascript:alert(1)" }] }),
      "VALIDATION_ERROR",
    );
    expect(expectOk(await service().getOwn(me.actor, d.id)).publications).toHaveLength(1);
  });

  it("tidak bisa mengedit saat submitted/under_review/published; inovasi orang lain NOT_FOUND", async () => {
    const me = await makeActor();
    const other = await makeActor();
    const d = expectOk(await service().createDraft(me.actor, valid()));
    for (const status of ["submitted", "under_review", "approved", "published"] as const) {
      await ctx.db.update(innovations).set({ status }).where(eq(innovations.id, d.id));
      expectFail(await service().update(me.actor, d.id, { title: "[DUMMY] Diubah paksa" }), "FORBIDDEN");
    }
    await ctx.db.update(innovations).set({ status: "draft" }).where(eq(innovations.id, d.id));
    expectFail(await service().update(other.actor, d.id, { title: "[DUMMY] Diubah orang lain" }), "NOT_FOUND");
    expect((await ctx.db.select().from(innovations).where(eq(innovations.id, d.id)))[0].title).toBe(d.title);
  });

  it("patch tidak valid atau memuat field terlarang ditolak tanpa mengubah data", async () => {
    const me = await makeActor();
    const d = expectOk(await service().createDraft(me.actor, valid()));
    for (const bad of [{ title: "x" }, { status: "published" }, { slug: "curang" }, { year: 1800 }]) {
      expectFail(await service().update(me.actor, d.id, bad), "VALIDATION_ERROR");
    }
    expect(expectOk(await service().getOwn(me.actor, d.id))).toMatchObject({ title: d.title, slug: d.slug, year: null });
  });
});

describe("pengajuan, penarikan, revisi, hapus", () => {
  it("pengajuan ditolak bila data belum lengkap, dengan daftar field yang kurang", async () => {
    const me = await makeActor();
    const d = expectOk(await service().createDraft(me.actor, valid({ leadResearcherId: null })));
    const r = expectFail(await service().submit(me.actor, d.id), "VALIDATION_ERROR");
    expect(r.details?.map((x) => x.field).sort()).toEqual(["categoryIds", "leadResearcherId"]);
    expect(expectOk(await service().getOwn(me.actor, d.id)).status).toBe("draft");
  });

  it("pengajuan sukses mengubah status, mencatat riwayat dan audit; pengajuan ulang konflik", async () => {
    const me = await makeActor();
    const cat = await makeCategory();
    const d = expectOk(await service().createDraft(me.actor, valid({ categoryIds: [cat] })));

    expect(expectOk(await service().submit(me.actor, d.id)).status).toBe("submitted");
    expectFail(await service().submit(me.actor, d.id), "INVALID_TRANSITION");

    const hist = expectOk(await service().history(me.actor, d.id));
    expect(hist.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "draft"],
      ["draft", "submitted"],
    ]);
    const audit = (await ctx.db.select().from(auditLogs)).map((a) => a.action).sort();
    expect(audit).toEqual(["innovation.create", "innovation.submit"]);
  });

  it("hanya pemilik yang bisa mengajukan, bahkan operator tidak bisa mengajukan milik orang lain", async () => {
    const me = await makeActor();
    const op = await makeActor("operator");
    const cat = await makeCategory();
    const d = expectOk(await service().createDraft(me.actor, valid({ categoryIds: [cat] })));
    expectFail(await service().submit(op.actor, d.id), "NOT_FOUND");
    expect(expectOk(await service().getOwn(me.actor, d.id)).status).toBe("draft");
  });

  it("menarik pengajuan: submitted kembali draft; dari draft atau status lain konflik", async () => {
    const me = await makeActor();
    const cat = await makeCategory();
    const d = expectOk(await service().createDraft(me.actor, valid({ categoryIds: [cat] })));

    expectFail(await service().withdraw(me.actor, d.id), "INVALID_TRANSITION");
    expectOk(await service().submit(me.actor, d.id));
    expect(expectOk(await service().withdraw(me.actor, d.id)).status).toBe("draft");

    expectOk(await service().submit(me.actor, d.id));
    await ctx.db.update(innovations).set({ status: "under_review" }).where(eq(innovations.id, d.id));
    expectFail(await service().withdraw(me.actor, d.id), "INVALID_TRANSITION");
  });

  it("revision_required: catatan operator terlihat, bisa diedit lalu diajukan ulang", async () => {
    const me = await makeActor();
    const cat = await makeCategory();
    const d = expectOk(await service().createDraft(me.actor, valid({ categoryIds: [cat] })));
    await ctx.db.update(innovations).set({ status: "revision_required" }).where(eq(innovations.id, d.id));
    await ctx.db.insert(statusHistories).values({
      innovationId: d.id,
      fromStatus: "under_review",
      toStatus: "revision_required",
      note: "[DUMMY] Lengkapi metodologi.",
    });

    const seen = expectOk(await service().getOwn(me.actor, d.id));
    expect(seen.revisionNote).toBe("[DUMMY] Lengkapi metodologi.");
    expectOk(await service().update(me.actor, d.id, { methodology: "[DUMMY] Metode dilengkapi." }));
    const again = expectOk(await service().submit(me.actor, d.id));
    expect(again.status).toBe("submitted");
    expect(again.revisionNote).toBeNull();
  });

  it("hapus: draft saja (soft delete), lalu tidak bisa dibaca; submitted/published ditolak", async () => {
    const me = await makeActor();
    const cat = await makeCategory();
    const draft = expectOk(await service().createDraft(me.actor, valid({ title: "[DUMMY] Akan dihapus" })));
    expectOk(await service().remove(me.actor, draft.id));
    expectFail(await service().getOwn(me.actor, draft.id), "NOT_FOUND");
    const [row] = await ctx.db.select().from(innovations).where(eq(innovations.id, draft.id));
    expect(row.deletedAt).not.toBeNull();

    const sub = expectOk(await service().createDraft(me.actor, valid({ title: "[DUMMY] Sudah diajukan", categoryIds: [cat] })));
    expectOk(await service().submit(me.actor, sub.id));
    expectFail(await service().remove(me.actor, sub.id), "FORBIDDEN");
    await ctx.db.update(innovations).set({ status: "published" }).where(eq(innovations.id, sub.id));
    expectFail(await service().remove(me.actor, sub.id), "FORBIDDEN");
    expect((await ctx.db.select().from(innovations).where(eq(innovations.id, sub.id)))[0].deletedAt).toBeNull();
  });

  it("dua pengajuan serentak: hanya satu yang berhasil (kunci baris)", async () => {
    const me = await makeActor();
    const cat = await makeCategory();
    const d = expectOk(await service().createDraft(me.actor, valid({ categoryIds: [cat] })));
    const results = await Promise.all([service().submit(me.actor, d.id), service().submit(me.actor, d.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const hist = await ctx.db.select().from(statusHistories).where(eq(statusHistories.toStatus, "submitted"));
    expect(hist).toHaveLength(1);
  });
});
