import { and, asc, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { can, type AuthUser } from "@/modules/auth/authorize";
import type { PermissionCode } from "@/modules/auth/permissions";
import {
  INNOVATION_STATUSES,
  validateTransition,
  type InnovationStatus,
} from "@/modules/workflow/transitions";
import { recordAudit } from "@/platform/audit/audit";
import type { Database } from "@/platform/db/client";
import { faculties, innovations, statusHistories, users } from "@/platform/db/schema";
import { z } from "@/platform/http/zod";
import { escapeLike } from "@/modules/catalog/pg-provider";
import {
  failure,
  NOT_FOUND,
  runService,
  toOwnInnovation,
  type OwnInnovation,
  type ServiceResult,
  type Tx,
} from "./service-core";
import type { InnovationService } from "./service";

export interface AdminListItem {
  id: string;
  slug: string;
  title: string;
  status: InnovationStatus;
  submitterName: string;
  facultyName: string | null;
  updatedAt: string;
}

export interface AdminHistoryItem {
  fromStatus: InnovationStatus | null;
  toStatus: InnovationStatus;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface AdminInnovation extends OwnInnovation {
  submitter: { id: string; name: string; email: string };
  history: AdminHistoryItem[];
}

/**
 * Izin yang dibutuhkan tiap transisi reviewer (docs/WORKFLOW.md §2, USER_ROLES.md).
 * Transisi milik pemilik (draft->submitted, dst.) tidak ada di sini, jadi ditolak lewat rute admin.
 */
const TRANSITION_PERMISSION: Record<string, PermissionCode> = {
  "submitted>under_review": "innovation.review",
  "under_review>revision_required": "innovation.review",
  "under_review>approved": "innovation.review",
  "approved>published": "innovation.publish",
  "published>unpublished": "innovation.publish",
  "unpublished>published": "innovation.publish",
  "unpublished>draft": "innovation.publish",
};

const transitionInputSchema = z.strictObject({
  to: z.enum(INNOVATION_STATUSES, "Status tujuan tidak dikenal."),
  note: z.string().trim().max(1000, "Catatan maksimal 1000 karakter.").nullable().optional(),
});

const deleteInputSchema = z.strictObject({
  reason: z.string().trim().min(3, "Alasan minimal 3 karakter.").max(500, "Alasan maksimal 500 karakter."),
});

export interface AdminHooks {
  /** Dipanggil setelah perubahan yang memengaruhi halaman publik (publikasi, penarikan, edit yang terbit). */
  onPublicChange?: () => void;
}

export function createAdminInnovationService(
  db: Database,
  innovationService: InnovationService,
  hooks: AdminHooks = {},
) {
  const run = <T,>(fn: (tx: Tx) => Promise<T>): Promise<ServiceResult<T>> => runService(db, fn);

  function requirePermission(actor: AuthUser, permission: PermissionCode) {
    if (!can(actor, permission)) failure("FORBIDDEN", "Anda tidak berwenang melakukan tindakan ini.");
  }

  async function lockedRow(tx: Tx, id: string) {
    if (!z.uuid().safeParse(id).success) NOT_FOUND();
    const [row] = await tx
      .select()
      .from(innovations)
      .where(and(eq(innovations.id, id), isNull(innovations.deletedAt)))
      .for("update");
    if (!row) NOT_FOUND();
    return row!;
  }

  /** Percobaan yang ditolak dicatat (WORKFLOW.md §2), di luar transaksi yang sudah dibatalkan. */
  async function auditDenied(actor: AuthUser, id: string, action: string, detail: Record<string, unknown>) {
    await recordAudit(db, { actorId: actor.id, action, entityType: "innovation", entityId: id, changes: detail });
  }

  async function get(actor: AuthUser, id: string): Promise<ServiceResult<AdminInnovation>> {
    return run(async (tx) => {
      if (!z.uuid().safeParse(id).success) NOT_FOUND();
      const [row] = await tx
        .select()
        .from(innovations)
        .where(and(eq(innovations.id, id), isNull(innovations.deletedAt)));
      if (!row) NOT_FOUND();
      // Layanan admin hanya untuk reviewer; pemilik biasa memakai layanan dosen (404 agar tidak bocor).
      if (!can(actor, "innovation.read_any")) NOT_FOUND();

      const detail = await toOwnInnovation(tx, row!, row!.submittedBy === actor.id);
      const [submitter] = await tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, row!.submittedBy));
      const history = await tx
        .select({
          fromStatus: statusHistories.fromStatus,
          toStatus: statusHistories.toStatus,
          note: statusHistories.note,
          actorName: users.name,
          createdAt: statusHistories.createdAt,
        })
        .from(statusHistories)
        .leftJoin(users, eq(users.id, statusHistories.actorId))
        .where(eq(statusHistories.innovationId, row!.id))
        .orderBy(asc(statusHistories.createdAt), asc(statusHistories.id));
      return {
        ...detail,
        submitter,
        history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
      };
    });
  }

  return {
    get,

    async list(
      actor: AuthUser,
      options: { status?: InnovationStatus; q?: string; facultyId?: string; page: number; perPage: number },
    ): Promise<ServiceResult<{ items: AdminListItem[]; total: number }>> {
      return run(async (tx) => {
        requirePermission(actor, "innovation.read_any");
        const conditions: (SQL | undefined)[] = [
          isNull(innovations.deletedAt),
          options.status ? eq(innovations.status, options.status) : undefined,
          options.facultyId ? eq(innovations.facultyId, options.facultyId) : undefined,
          options.q ? sql`${innovations.title} ilike ${`%${escapeLike(options.q)}%`}` : undefined,
        ];
        const where = and(...conditions);

        const rows = await tx
          .select({
            id: innovations.id,
            slug: innovations.slug,
            title: innovations.title,
            status: innovations.status,
            submitterName: users.name,
            facultyName: faculties.name,
            updatedAt: innovations.updatedAt,
          })
          .from(innovations)
          .innerJoin(users, eq(users.id, innovations.submittedBy))
          .leftJoin(faculties, eq(faculties.id, innovations.facultyId))
          .where(where)
          .orderBy(desc(innovations.updatedAt), desc(innovations.id))
          .limit(options.perPage)
          .offset((options.page - 1) * options.perPage);
        const [total] = await tx.select({ n: count() }).from(innovations).where(where);

        return {
          items: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
          total: total.n,
        };
      });
    },

    /** Operator mengubah isi lewat aturan yang sama dengan pemilik, tanpa batas status (update_any). */
    async update(actor: AuthUser, id: string, patch: unknown): Promise<ServiceResult<OwnInnovation>> {
      if (!can(actor, "innovation.update_any")) return { ok: false, code: "NOT_FOUND", message: "Data tidak ditemukan." };
      const result = await innovationService.update(actor, id, patch);
      if (result.ok && result.data.status === "published") hooks.onPublicChange?.();
      return result;
    },

    async transition(actor: AuthUser, id: string, rawInput: unknown): Promise<ServiceResult<AdminInnovation>> {
      let touchedPublic = false;
      let attempted: { to?: string; code?: string } = {};

      const result = await run(async (tx) => {
        const row = await lockedRow(tx, id);
        // Bukan reviewer sama sekali -> 404, supaya keberadaan data tidak bocor.
        if (!can(actor, "innovation.read_any")) NOT_FOUND();

        const parsed = transitionInputSchema.safeParse(rawInput);
        if (!parsed.success) {
          return failure(
            "VALIDATION_ERROR",
            "Data yang dikirim tidak valid.",
            parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message })),
          );
        }
        const { to, note } = parsed.data;
        attempted = { to };

        const verdict = validateTransition({
          from: row.status,
          to,
          actor: "reviewer",
          actorIsOwner: row.submittedBy === actor.id,
          note,
        });
        if (!verdict.ok) {
          if (verdict.code === "INVALID_TRANSITION") failure("INVALID_TRANSITION", verdict.message);
          if (verdict.code === "NOTE_REQUIRED") {
            failure("VALIDATION_ERROR", verdict.message, [{ field: "note", message: verdict.message }]);
          }
          failure("FORBIDDEN", verdict.message);
        }

        const needed = TRANSITION_PERMISSION[`${row.status}>${to}`];
        if (!needed) failure("FORBIDDEN", "Perubahan status ini hanya dapat dilakukan oleh pemilik.");
        requirePermission(actor, needed);

        const now = new Date();
        const set: Partial<typeof innovations.$inferInsert> = { status: to };
        if (to === "published" && !row.firstPublishedAt) {
          // Slug terkunci sejak publikasi pertama (WORKFLOW.md §3 aturan 5).
          set.firstPublishedAt = now;
          set.publishedAt = now;
        }
        await tx.update(innovations).set(set).where(eq(innovations.id, id));
        await tx.insert(statusHistories).values({
          innovationId: id,
          fromStatus: row.status,
          toStatus: to,
          actorId: actor.id,
          note: note?.trim() || null,
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: "innovation.transition",
          entityType: "innovation",
          entityId: id,
          changes: { from: row.status, to },
        });
        touchedPublic = row.status === "published" || to === "published";
        return null;
      });

      if (!result.ok) {
        if (result.code === "INVALID_TRANSITION" || result.code === "FORBIDDEN") {
          attempted = { ...attempted, code: result.code };
          await auditDenied(actor, id, "innovation.transition_denied", attempted);
        }
        return result;
      }
      if (touchedPublic) hooks.onPublicChange?.();
      return get(actor, id);
    },

    async remove(actor: AuthUser, id: string, rawInput: unknown): Promise<ServiceResult<{ deleted: true }>> {
      const result = await run(async (tx) => {
        const row = await lockedRow(tx, id);
        if (!can(actor, "innovation.read_any")) NOT_FOUND();
        if (!can(actor, "innovation.delete_any")) failure("FORBIDDEN", "Anda tidak berwenang menghapus inovasi ini.");
        const parsed = deleteInputSchema.safeParse(rawInput);
        if (!parsed.success) {
          return failure(
            "VALIDATION_ERROR",
            "Data yang dikirim tidak valid.",
            parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message })),
          );
        }
        // Inovasi terbit harus ditarik dulu supaya halaman publik dan sitemap diperbarui lewat alur resmi.
        if (row.status === "published") {
          failure("INVALID_TRANSITION", "Inovasi yang terbit harus ditarik dulu sebelum dihapus.");
        }
        await tx.update(innovations).set({ deletedAt: new Date() }).where(eq(innovations.id, id));
        await recordAudit(tx, {
          actorId: actor.id,
          action: "innovation.delete",
          entityType: "innovation",
          entityId: id,
          changes: { reason: parsed.data.reason, status: row.status },
        });
        return { deleted: true as const };
      });
      return result;
    },
  };
}

export type AdminInnovationService = ReturnType<typeof createAdminInnovationService>;
