import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/modules/auth/authorize";
import { ROLE_PERMISSIONS, type RoleCode } from "@/modules/auth/permissions";
import { createPgCatalogProvider } from "@/modules/catalog/pg-provider";
import { auditLogs, categories, innovations, researchers, statusHistories, users } from "@/platform/db/schema";
import { resetTestDb, setupTestDb } from "@/platform/db/testing";
import { createAdminInnovationService } from "./admin-service";
import { createInnovationService } from "./service";
import type { ServiceResult } from "./service-core";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
const onPublicChange = vi.fn();
const dosenService = () => createInnovationService(ctx.db);
const admin = () => createAdminInnovationService(ctx.db, dosenService(), { onPublicChange });

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
async function makeActor(role: RoleCode = "researcher") {
  const n = ++counter;
  const [u] = await ctx.db
    .insert(users)
    .values({ ssoSubject: `s-${n}`, email: `u${n}@uninus.ac.id`, name: `[DUMMY] ${role} ${n}` })
    .returning();
  const [r] = await ctx.db
    .insert(researchers)
    .values({ userId: u.id, slug: `peneliti-${n}`, fullName: `[DUMMY] Peneliti ${n}` })
    .returning();
  const actor: AuthUser = { id: u.id, permissions: new Set(ROLE_PERMISSIONS[role]) };
  return { actor, userId: u.id, researcherId: r.id };
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

/** Draft lengkap lalu diajukan, siap diperiksa. */
async function submitted(owner: Awaited<ReturnType<typeof makeActor>>, title = "[DUMMY] Pengering Padi Surya") {
  const [cat] = await ctx.db.insert(categories).values({ slug: `k-${++counter}`, name: "[DUMMY] Kategori" }).returning();
  const d = ok(
    await dosenService().createDraft(owner.actor, {
      title,
      summary: "[DUMMY] Ringkasan inovasi yang cukup panjang untuk lolos validasi.",
      categoryIds: [cat.id],
    }),
  );
  return ok(await dosenService().submit(owner.actor, d.id));
}

const go = (op: AuthUser, id: string, to: string, note?: string) =>
  admin().transition(op, id, { to, ...(note !== undefined ? { note } : {}) });

describe("alur verifikasi sampai terbit", () => {
  it("diajukan -> diperiksa -> disetujui -> terbit, lalu muncul di katalog publik; ditarik, hilang", async () => {
    const dosen = await makeActor();
    const op = await makeActor("operator");
    const inv = await submitted(dosen);
    const catalog = createPgCatalogProvider(ctx.db);

    expect((await catalog.search({ page: 1, perPage: 12 })).total).toBe(0);
    expect(ok(await go(op.actor, inv.id, "under_review")).status).toBe("under_review");
    expect(ok(await go(op.actor, inv.id, "approved")).status).toBe("approved");
    expect(onPublicChange).not.toHaveBeenCalled();
    expect((await catalog.search({ page: 1, perPage: 12 })).total).toBe(0);

    expect(ok(await go(op.actor, inv.id, "published")).status).toBe("published");
    expect(onPublicChange).toHaveBeenCalledTimes(1);
    const publik = await catalog.search({ q: "pengering", page: 1, perPage: 12 });
    expect(publik.items.map((i) => i.slug)).toEqual([inv.slug]);

    const [row] = await ctx.db.select().from(innovations).where(eq(innovations.id, inv.id));
    expect(row.firstPublishedAt).not.toBeNull();
    expect(row.publishedAt).not.toBeNull();

    // Penarikan wajib catatan, dan langsung hilang dari publik.
    fails(await go(op.actor, inv.id, "unpublished"), "VALIDATION_ERROR");
    expect(ok(await go(op.actor, inv.id, "unpublished", "[DUMMY] Ada data keliru")).status).toBe("unpublished");
    expect(onPublicChange).toHaveBeenCalledTimes(2);
    expect((await catalog.search({ page: 1, perPage: 12 })).total).toBe(0);
    expect(await catalog.getBySlug(inv.slug)).toBeNull();

    // Terbit ulang tidak mengubah tanggal terbit pertama dan slug.
    const first = row.firstPublishedAt!.getTime();
    ok(await go(op.actor, inv.id, "published"));
    const [again] = await ctx.db.select().from(innovations).where(eq(innovations.id, inv.id));
    expect(again.firstPublishedAt!.getTime()).toBe(first);
    expect(again.slug).toBe(inv.slug);
    expect((await catalog.search({ page: 1, perPage: 12 })).total).toBe(1);
  });

  it("riwayat lengkap dengan nama aktor dan catatan; audit mencatat tiap transisi", async () => {
    const dosen = await makeActor();
    const op = await makeActor("operator");
    const inv = await submitted(dosen);
    ok(await go(op.actor, inv.id, "under_review"));
    ok(await go(op.actor, inv.id, "revision_required", "[DUMMY] Lengkapi metodologi."));

    const detail = ok(await admin().get(op.actor, inv.id));
    expect(detail.submitter).toMatchObject({ id: dosen.userId });
    expect(detail.history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "draft"],
      ["draft", "submitted"],
      ["submitted", "under_review"],
      ["under_review", "revision_required"],
    ]);
    expect(detail.history[3]).toMatchObject({ note: "[DUMMY] Lengkapi metodologi.", actorName: expect.stringContaining("operator") });

    // Dosen melihat catatan revisi lalu bisa memperbaiki dan mengajukan ulang.
    expect(ok(await dosenService().getOwn(dosen.actor, inv.id)).revisionNote).toBe("[DUMMY] Lengkapi metodologi.");
    ok(await dosenService().update(dosen.actor, inv.id, { methodology: "[DUMMY] Dilengkapi." }));
    expect(ok(await dosenService().submit(dosen.actor, inv.id)).status).toBe("submitted");

    const actions = (await ctx.db.select({ a: auditLogs.action }).from(auditLogs)).map((r) => r.a);
    expect(actions.filter((a) => a === "innovation.transition")).toHaveLength(2);
  });

  it("revision_required mewajibkan catatan; catatan kosong/spasi ditolak", async () => {
    const op = await makeActor("operator");
    const inv = await submitted(await makeActor());
    ok(await go(op.actor, inv.id, "under_review"));
    for (const note of [undefined, "", "   "]) {
      const r = fails(await go(op.actor, inv.id, "revision_required", note), "VALIDATION_ERROR");
      expect(r.details?.[0].field).toBe("note");
    }
    expect((await ctx.db.select().from(innovations).where(eq(innovations.id, inv.id)))[0].status).toBe("under_review");
  });
});

describe("aturan dan penolakan", () => {
  it("pemisahan tugas: operator tidak boleh memeriksa/menyetujui pengajuannya sendiri; percobaan dicatat", async () => {
    const op = await makeActor("operator");
    const other = await makeActor("operator");
    const inv = await submitted(op);

    fails(await go(op.actor, inv.id, "under_review"), "FORBIDDEN");
    expect(ok(await go(other.actor, inv.id, "under_review")).status).toBe("under_review");
    fails(await go(op.actor, inv.id, "approved"), "FORBIDDEN");
    fails(await go(op.actor, inv.id, "revision_required", "[DUMMY] catatan"), "FORBIDDEN");

    const denied = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "innovation.transition_denied"));
    expect(denied).toHaveLength(3);
    expect(denied[0]).toMatchObject({ actorId: op.userId, entityId: inv.id });
  });

  it("pasangan status yang tidak ada ditolak 409 dan dicatat; status tidak berubah", async () => {
    const op = await makeActor("operator");
    const inv = await submitted(await makeActor());
    for (const to of ["published", "approved", "unpublished", "submitted"]) {
      fails(await go(op.actor, inv.id, to), "INVALID_TRANSITION");
    }
    // Pasangan sah tetapi milik pemilik (tarik kembali): bukan wewenang operator.
    fails(await go(op.actor, inv.id, "draft"), "FORBIDDEN");
    expect((await ctx.db.select().from(innovations).where(eq(innovations.id, inv.id)))[0].status).toBe("submitted");
    expect(await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "innovation.transition_denied"))).toHaveLength(5);
    expect(onPublicChange).not.toHaveBeenCalled();
  });

  it("transisi milik pemilik tidak bisa dipakai operator lewat rute admin", async () => {
    const op = await makeActor("operator");
    const [cat] = await ctx.db.insert(categories).values({ slug: "k", name: "[DUMMY]" }).returning();
    const dosen = await makeActor();
    const d = ok(
      await dosenService().createDraft(dosen.actor, {
        title: "[DUMMY] Draft milik dosen",
        summary: "[DUMMY] Ringkasan inovasi yang cukup panjang untuk lolos validasi.",
        categoryIds: [cat.id],
      }),
    );
    fails(await go(op.actor, d.id, "submitted"), "FORBIDDEN");
    expect((await ctx.db.select().from(innovations).where(eq(innovations.id, d.id)))[0].status).toBe("draft");
  });

  it("dosen biasa: daftar FORBIDDEN, inovasi apa pun 404 (termasuk miliknya lewat rute admin)", async () => {
    const dosen = await makeActor();
    const inv = await submitted(dosen);
    fails(await admin().list(dosen.actor, { page: 1, perPage: 20 }), "FORBIDDEN");
    fails(await go(dosen.actor, inv.id, "under_review"), "NOT_FOUND");
    fails(await admin().get(dosen.actor, inv.id), "NOT_FOUND");
    fails(await go((await makeActor("operator")).actor, "bukan-uuid", "under_review"), "NOT_FOUND");
  });

  it("input transisi tidak valid ditolak: status ngawur, field tambahan", async () => {
    const op = await makeActor("operator");
    const inv = await submitted(await makeActor());
    fails(await admin().transition(op.actor, inv.id, { to: "dihapus" }), "VALIDATION_ERROR");
    fails(await admin().transition(op.actor, inv.id, { to: "under_review", status: "published" }), "VALIDATION_ERROR");
    fails(await admin().transition(op.actor, inv.id, "teks"), "VALIDATION_ERROR");
  });
});

describe("daftar, ubah, hapus oleh operator", () => {
  it("daftar memuat semua pengaju dengan filter status/judul dan paginasi; % bukan wildcard", async () => {
    const op = await makeActor("operator");
    await submitted(await makeActor(), "[DUMMY] Alat pengering");
    await submitted(await makeActor(), "[DUMMY] Aplikasi desa");
    const third = await submitted(await makeActor(), "[DUMMY] Biogas rumah tangga");
    ok(await go(op.actor, third.id, "under_review"));

    const all = ok(await admin().list(op.actor, { page: 1, perPage: 20 }));
    expect(all.total).toBe(3);
    expect(all.items[0]).toHaveProperty("submitterName");
    expect(ok(await admin().list(op.actor, { page: 1, perPage: 20, status: "under_review" })).items.map((i) => i.id)).toEqual([third.id]);
    expect(ok(await admin().list(op.actor, { page: 1, perPage: 20, q: "PENGERING" })).total).toBe(1);
    expect(ok(await admin().list(op.actor, { page: 1, perPage: 20, q: "%" })).total).toBe(0);
    expect(ok(await admin().list(op.actor, { page: 2, perPage: 2 })).items).toHaveLength(1);
  });

  it("ringkasan jumlah per status mencakup semua pengaju dan mengabaikan yang terhapus", async () => {
    const op = await makeActor("operator");
    const a = await submitted(await makeActor(), "[DUMMY] Satu");
    await submitted(await makeActor(), "[DUMMY] Dua");
    const c = await submitted(await makeActor(), "[DUMMY] Tiga");
    ok(await go(op.actor, c.id, "under_review"));
    ok(await admin().remove(op.actor, a.id, { reason: "[DUMMY] duplikat" }));

    expect(ok(await admin().counts(op.actor))).toEqual({ submitted: 1, under_review: 1 });
    fails(await admin().counts((await makeActor()).actor), "FORBIDDEN");
  });

  it("operator mengubah inovasi terbit tanpa mengubah slug dan memicu penyegaran publik", async () => {
    const op = await makeActor("operator");
    const other = await makeActor("operator");
    const inv = await submitted(await makeActor());
    ok(await go(other.actor, inv.id, "under_review"));
    ok(await go(other.actor, inv.id, "approved"));
    ok(await go(other.actor, inv.id, "published"));
    onPublicChange.mockClear();

    const u = ok(await admin().update(op.actor, inv.id, { title: "[DUMMY] Judul diperbaiki operator" }));
    expect(u.title).toBe("[DUMMY] Judul diperbaiki operator");
    expect(u.slug).toBe(inv.slug);
    expect(onPublicChange).toHaveBeenCalledTimes(1);
  });

  it("hapus: alasan wajib, yang terbit harus ditarik dulu, lalu hilang dari semua daftar", async () => {
    const op = await makeActor("operator");
    const inv = await submitted(await makeActor());

    fails(await admin().remove(op.actor, inv.id, {}), "VALIDATION_ERROR");
    fails(await admin().remove(op.actor, inv.id, { reason: "x" }), "VALIDATION_ERROR");

    const other = await makeActor("operator");
    ok(await go(other.actor, inv.id, "under_review"));
    ok(await go(other.actor, inv.id, "approved"));
    ok(await go(other.actor, inv.id, "published"));
    fails(await admin().remove(op.actor, inv.id, { reason: "[DUMMY] Duplikat" }), "INVALID_TRANSITION");
    ok(await go(other.actor, inv.id, "unpublished", "[DUMMY] Ditarik"));

    ok(await admin().remove(op.actor, inv.id, { reason: "[DUMMY] Duplikat" }));
    fails(await admin().get(op.actor, inv.id), "NOT_FOUND");
    expect(ok(await admin().list(op.actor, { page: 1, perPage: 20 })).total).toBe(0);
    const [log] = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "innovation.delete"));
    expect(log.changes).toMatchObject({ reason: "[DUMMY] Duplikat" });
    // Riwayat tetap utuh untuk penelusuran.
    expect((await ctx.db.select().from(statusHistories).where(eq(statusHistories.innovationId, inv.id))).length).toBeGreaterThan(3);
  });

  it("dua operator menyetujui bersamaan: hanya satu transisi yang tercatat", async () => {
    const a = await makeActor("operator");
    const b = await makeActor("operator");
    const inv = await submitted(await makeActor());
    const results = await Promise.all([go(a.actor, inv.id, "under_review"), go(b.actor, inv.id, "under_review")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const hist = await ctx.db.select().from(statusHistories).where(eq(statusHistories.toStatus, "under_review"));
    expect(hist).toHaveLength(1);
  });
});
