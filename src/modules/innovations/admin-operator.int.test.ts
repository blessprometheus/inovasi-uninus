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

// Alur operator (ADR-008) harus berjalan dengan portal dosen MATI, ini keadaan produksi.
delete process.env.RESEARCHER_PORTAL;

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
const onPublicChange = vi.fn();
const admin = () => createAdminInnovationService(ctx.db, createInnovationService(ctx.db), { onPublicChange });

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
async function makeUser(role: RoleCode) {
  const n = ++counter;
  const [u] = await ctx.db
    .insert(users)
    .values({ ssoSubject: `s-${n}`, email: `u${n}@uninus.ac.id`, name: `[DUMMY] ${role} ${n}` })
    .returning();
  const actor: AuthUser = { id: u.id, permissions: new Set(ROLE_PERMISSIONS[role]) };
  return { actor, userId: u.id };
}

/** Peneliti adalah data yang diketik operator: tanpa akun (user_id kosong). */
async function makeResearcher() {
  const n = ++counter;
  const [r] = await ctx.db
    .insert(researchers)
    .values({ slug: `peneliti-${n}`, fullName: `[DUMMY] Peneliti ${n}` })
    .returning();
  return r.id;
}

async function makeCategory() {
  const [c] = await ctx.db.insert(categories).values({ slug: `k-${++counter}`, name: "[DUMMY] Kategori" }).returning();
  return c.id;
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

const COMPLETE = async () => ({
  title: "[DUMMY] Pengering Padi Surya",
  summary: "[DUMMY] Ringkasan inovasi yang cukup panjang untuk lolos validasi.",
  categoryIds: [await makeCategory()],
  leadResearcherId: await makeResearcher(),
});

const go = (op: AuthUser, id: string, to: string, note?: string) =>
  admin().transition(op, id, { to, ...(note !== undefined ? { note } : {}) });

describe("operator menginput dan menerbitkan (portal dosen mati)", () => {
  it("membuat draft atas nama operator, lalu draft -> terbit langsung muncul di katalog", async () => {
    const op = await makeUser("operator");
    const created = ok(await admin().create(op.actor, await COMPLETE()));
    expect(created.status).toBe("draft");
    expect(created.submitter.id).toBe(op.userId);
    expect(created.leadResearcherId).not.toBeNull();

    const catalog = createPgCatalogProvider(ctx.db);
    expect((await catalog.search({ page: 1, perPage: 12 })).total).toBe(0);

    const published = ok(await go(op.actor, created.id, "published"));
    expect(published.status).toBe("published");
    expect(onPublicChange).toHaveBeenCalledTimes(1);
    expect((await catalog.search({ page: 1, perPage: 12 })).total).toBe(1);

    const [row] = await ctx.db.select().from(innovations).where(eq(innovations.id, created.id));
    expect(row.firstPublishedAt).not.toBeNull();
    const history = await ctx.db.select().from(statusHistories).where(eq(statusHistories.innovationId, created.id));
    expect(history.map((h) => `${h.fromStatus}>${h.toStatus}`).sort()).toEqual(["draft>published", "null>draft"]);
  });

  it("menerbitkan draft yang belum lengkap ditolak dengan rincian field, status tetap draft", async () => {
    const op = await makeUser("operator");
    const created = ok(
      await admin().create(op.actor, {
        title: "[DUMMY] Draft Belum Lengkap",
        summary: "[DUMMY] Ringkasan yang cukup panjang untuk lolos validasi.",
      }),
    );
    const res = fails(await go(op.actor, created.id, "published"), "VALIDATION_ERROR");
    expect(res.ok ? [] : (res.details ?? []).map((d) => d.field).sort()).toEqual(["categoryIds", "leadResearcherId"]);
    expect(ok(await admin().get(op.actor, created.id)).status).toBe("draft");
    expect(onPublicChange).not.toHaveBeenCalled();
  });

  it("draft cukup judul; terbit ditolak dengan semua yang kurang, lalu berhasil setelah dilengkapi", async () => {
    const op = await makeUser("operator");
    const created = ok(await admin().create(op.actor, { title: "[DUMMY] Hanya Judul Dulu" }));
    expect(created.status).toBe("draft");
    expect(created.summary).toBe("");

    const res = fails(await go(op.actor, created.id, "published"), "VALIDATION_ERROR");
    expect(res.ok ? [] : (res.details ?? []).map((d) => d.field).sort()).toEqual(["categoryIds", "leadResearcherId", "summary"]);

    const done = await COMPLETE();
    ok(await admin().update(op.actor, created.id, { summary: done.summary, categoryIds: done.categoryIds, leadResearcherId: done.leadResearcherId }));
    expect(ok(await go(op.actor, created.id, "published")).status).toBe("published");
  });

  it("tarik wajib beralasan, lalu bisa terbit ulang atau kembali ke draft", async () => {
    const op = await makeUser("operator");
    const { id } = ok(await admin().create(op.actor, await COMPLETE()));
    ok(await go(op.actor, id, "published"));

    fails(await go(op.actor, id, "unpublished"), "VALIDATION_ERROR");
    expect(ok(await go(op.actor, id, "unpublished", "Data perlu dikoreksi")).status).toBe("unpublished");
    expect(ok(await go(op.actor, id, "published")).status).toBe("published");
    ok(await go(op.actor, id, "unpublished", "Tarik lagi"));
    expect(ok(await go(op.actor, id, "draft")).status).toBe("draft");
  });

  it("status alur pengajuan lama tidak bisa dicapai, dan percobaannya tercatat di audit log", async () => {
    const op = await makeUser("operator");
    const { id } = ok(await admin().create(op.actor, await COMPLETE()));
    for (const to of ["submitted", "under_review", "revision_required", "approved"]) {
      fails(await go(op.actor, id, to, "x"), "INVALID_TRANSITION");
    }
    fails(await go(op.actor, id, "draft"), "INVALID_TRANSITION");
    expect(ok(await admin().get(op.actor, id)).status).toBe("draft");
    const denied = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, "innovation.transition_denied"));
    expect(denied.length).toBe(5);
  });

  it("operator boleh menerbitkan draft buatannya sendiri (tidak ada pemisahan tugas)", async () => {
    const op = await makeUser("operator");
    const { id } = ok(await admin().create(op.actor, await COMPLETE()));
    expect(ok(await go(op.actor, id, "published")).submitter.id).toBe(op.userId);
  });

  it("menyunting inovasi terbit langsung tampil di publik dan mengabari cache", async () => {
    const op = await makeUser("operator");
    const { id } = ok(await admin().create(op.actor, await COMPLETE()));
    ok(await go(op.actor, id, "published"));
    onPublicChange.mockClear();

    const edited = ok(await admin().update(op.actor, id, { title: "[DUMMY] Judul Setelah Diperbaiki" }));
    expect(edited.status).toBe("published");
    expect(edited.title).toBe("[DUMMY] Judul Setelah Diperbaiki");
    expect(onPublicChange).toHaveBeenCalledTimes(1);
    const [row] = await ctx.db.select().from(innovations).where(eq(innovations.id, id));
    expect(row.slug).toContain("pengering-padi"); // slug terkunci sejak terbit pertama
  });

  it("peneliti tanpa akun bisa menjadi ketua dan anggota", async () => {
    const op = await makeUser("operator");
    const base = await COMPLETE();
    const member = await makeResearcher();
    const created = ok(await admin().create(op.actor, { ...base, memberResearcherIds: [member] }));
    expect(created.leadResearcherId).toBe(base.leadResearcherId);
    expect(created.memberResearcherIds).toEqual([member]);
  });
});

describe("akses", () => {
  it("peran tanpa izin admin ditolak membuat, dan tidak bisa mengubah status (404, tidak membocorkan)", async () => {
    const op = await makeUser("operator");
    const dosen = await makeUser("researcher");
    const { id } = ok(await admin().create(op.actor, await COMPLETE()));

    fails(await admin().create(dosen.actor, await COMPLETE()), "FORBIDDEN");
    fails(await go(dosen.actor, id, "published"), "NOT_FOUND");
    expect(ok(await admin().get(op.actor, id)).status).toBe("draft");
  });

  it("input tidak valid atau berisi field terlarang ditolak", async () => {
    const op = await makeUser("operator");
    fails(await admin().create(op.actor, { title: "x", summary: "pendek" }), "VALIDATION_ERROR");
    fails(await admin().create(op.actor, { ...(await COMPLETE()), status: "published" }), "VALIDATION_ERROR");
    fails(await admin().create(op.actor, { ...(await COMPLETE()), submittedBy: op.userId }), "VALIDATION_ERROR");
  });
});
