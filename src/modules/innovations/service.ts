import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { authorizeInnovation, can, type AuthUser, type InnovationAction } from "@/modules/auth/authorize";
import type { PermissionCode } from "@/modules/auth/permissions";
import { validateTransition, type InnovationStatus } from "@/modules/workflow/transitions";
import { recordAudit } from "@/platform/audit/audit";
import type { Database } from "@/platform/db/client";
import {
  categories,
  innovationCategories,
  innovationMembers,
  innovations,
  intellectualProperties,
  publications,
  researchers,
  statusHistories,
} from "@/platform/db/schema";
import { z } from "@/platform/http/zod";
import {
  innovationDraftSchema,
  innovationPatchSchema,
  missingForSubmission,
  type InnovationDraftInput,
} from "./schemas";
import {
  currentTeam,
  failure,
  NOT_FOUND,
  runService,
  toOwnInnovation,
  type Executor,
  type OwnInnovation,
  type ServiceResult,
  type StatusHistoryItem,
  type Tx,
} from "./service-core";
import { uniqueSlug } from "./slug";

export type { OwnInnovation, ServiceError, ServiceResult, StatusHistoryItem } from "./service-core";

export interface OwnInnovationListItem {
  id: string;
  slug: string;
  title: string;
  status: InnovationStatus;
  isOwner: boolean;
  updatedAt: string;
}

const TEXT_FIELDS = [
  "title",
  "summary",
  "abstract",
  "background",
  "problemStatement",
  "objective",
  "methodology",
  "description",
  "advantages",
  "benefits",
  "developmentPotential",
  "year",
  "typeId",
  "facultyId",
  "studyProgramId",
] as const;

const uuidSchema = z.uuid();

export function createInnovationService(db: Database) {
  const run = <T,>(fn: (tx: Tx) => Promise<T>): Promise<ServiceResult<T>> => runService(db, fn);

  function requirePermission(actor: AuthUser, permission: PermissionCode) {
    if (!can(actor, permission)) failure("FORBIDDEN", "Anda tidak berwenang melakukan tindakan ini.");
  }

  async function isTeamMember(x: Executor, innovationId: string, userId: string): Promise<boolean> {
    const [row] = await x
      .select({ one: sql<number>`1` })
      .from(innovationMembers)
      .innerJoin(researchers, eq(researchers.id, innovationMembers.researcherId))
      .where(and(eq(innovationMembers.innovationId, innovationId), eq(researchers.userId, userId)));
    return Boolean(row);
  }

  /** Memuat inovasi (opsional dikunci) lalu menerapkan keputusan otorisasi. NOT_FOUND tidak membocorkan keberadaan. */
  async function loadAuthorized(
    x: Executor,
    actor: AuthUser,
    id: string,
    action: InnovationAction,
    options: { lock?: boolean; conflictAsTransition?: boolean } = {},
  ) {
    if (!uuidSchema.safeParse(id).success) NOT_FOUND();
    const query = x
      .select()
      .from(innovations)
      .where(and(eq(innovations.id, id), isNull(innovations.deletedAt)));
    const [row] = options.lock ? await query.for("update") : await query;
    if (!row) NOT_FOUND();

    const decision = authorizeInnovation(actor, action, {
      submittedBy: row!.submittedBy,
      status: row!.status,
      isTeamMember: await isTeamMember(x, row!.id, actor.id),
    });
    if (!decision.allowed) {
      if (decision.reason === "NOT_FOUND") NOT_FOUND();
      // Pengajuan/penarikan pada status yang salah adalah konflik state, bukan masalah izin.
      failure(options.conflictAsTransition ? "INVALID_TRANSITION" : "FORBIDDEN", decision.message);
    }
    return row!;
  }

  async function assertResearchersExist(x: Executor, ids: string[]) {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const [row] = await x
      .select({ n: count() })
      .from(researchers)
      .where(and(inArray(researchers.id, unique), isNull(researchers.deletedAt)));
    if (row.n !== unique.length) {
      failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", [
        { field: "memberResearcherIds", message: "Ada peneliti yang tidak ditemukan." },
      ]);
    }
  }

  async function replaceRelations(
    x: Executor,
    innovationId: string,
    input: Partial<InnovationDraftInput>,
    currentTeam?: { lead: string | null; members: string[] },
  ) {
    if (input.categoryIds !== undefined) {
      const ids = [...new Set(input.categoryIds)];
      if (ids.length) {
        const [row] = await x
          .select({ n: count() })
          .from(categories)
          .where(and(inArray(categories.id, ids), eq(categories.isActive, true)));
        if (row.n !== ids.length) {
          failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", [
            { field: "categoryIds", message: "Ada kategori yang tidak ditemukan." },
          ]);
        }
      }
      await x.delete(innovationCategories).where(eq(innovationCategories.innovationId, innovationId));
      if (ids.length) {
        await x.insert(innovationCategories).values(ids.map((categoryId) => ({ innovationId, categoryId })));
      }
    }

    if (input.leadResearcherId !== undefined || input.memberResearcherIds !== undefined) {
      const lead = input.leadResearcherId !== undefined ? input.leadResearcherId : (currentTeam?.lead ?? null);
      const members = input.memberResearcherIds !== undefined ? input.memberResearcherIds : (currentTeam?.members ?? []);
      if (lead && members.includes(lead)) {
        failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", [
          { field: "memberResearcherIds", message: "Ketua tidak boleh juga terdaftar sebagai anggota." },
        ]);
      }
      await assertResearchersExist(x, [...(lead ? [lead] : []), ...members]);
      await x.delete(innovationMembers).where(eq(innovationMembers.innovationId, innovationId));
      const rows = [
        ...(lead ? [{ innovationId, researcherId: lead, role: "lead" as const, sortOrder: 0 }] : []),
        ...members.map((researcherId, i) => ({ innovationId, researcherId, role: "member" as const, sortOrder: i + 1 })),
      ];
      if (rows.length) await x.insert(innovationMembers).values(rows);
    }

    if (input.publications !== undefined) {
      await x.delete(publications).where(eq(publications.innovationId, innovationId));
      if (input.publications.length) {
        await x.insert(publications).values(
          input.publications.map((p, i) => ({
            innovationId,
            title: p.title,
            url: p.url ?? null,
            doi: p.doi ?? null,
            venue: p.venue ?? null,
            year: p.year ?? null,
            sortOrder: i,
          })),
        );
      }
    }

    if (input.intellectualProperties !== undefined) {
      await x.delete(intellectualProperties).where(eq(intellectualProperties.innovationId, innovationId));
      if (input.intellectualProperties.length) {
        await x.insert(intellectualProperties).values(
          input.intellectualProperties.map((p) => ({
            innovationId,
            kind: p.kind,
            status: p.status ?? null,
            registrationNumber: p.registrationNumber ?? null,
            year: p.year ?? null,
            notes: p.notes ?? null,
          })),
        );
      }
    }
  }

  return {
    async createDraft(actor: AuthUser, rawInput: unknown): Promise<ServiceResult<OwnInnovation>> {
      return run(async (tx) => {
        requirePermission(actor, "innovation.create");
        const parsed = innovationDraftSchema.safeParse(rawInput);
        if (!parsed.success) {
          return failure(
            "VALIDATION_ERROR",
            "Data yang dikirim tidak valid.",
            parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message })),
          );
        }
        const input = parsed.data;

        // Ketua default adalah profil peneliti milik pembuat, bila ada dan tidak disebut eksplisit.
        let leadResearcherId = input.leadResearcherId;
        if (leadResearcherId === undefined) {
          const [own] = await tx
            .select({ id: researchers.id })
            .from(researchers)
            .where(and(eq(researchers.userId, actor.id), isNull(researchers.deletedAt)));
          leadResearcherId = own?.id ?? null;
        }
        const memberResearcherIds = (input.memberResearcherIds ?? []).filter((m) => m !== leadResearcherId);

        const slug = await uniqueSlug(input.title, async (candidate) => {
          const [hit] = await tx.select({ id: innovations.id }).from(innovations).where(eq(innovations.slug, candidate));
          return Boolean(hit);
        });

        const [row] = await tx
          .insert(innovations)
          .values({
            slug,
            submittedBy: actor.id,
            status: "draft",
            title: input.title,
            summary: input.summary,
            abstract: input.abstract ?? null,
            background: input.background ?? null,
            problemStatement: input.problemStatement ?? null,
            objective: input.objective ?? null,
            methodology: input.methodology ?? null,
            description: input.description ?? null,
            advantages: input.advantages ?? null,
            benefits: input.benefits ?? null,
            developmentPotential: input.developmentPotential ?? null,
            year: input.year ?? null,
            typeId: input.typeId ?? null,
            facultyId: input.facultyId ?? null,
            studyProgramId: input.studyProgramId ?? null,
          })
          .returning();

        await replaceRelations(tx, row.id, { ...input, leadResearcherId, memberResearcherIds });
        await tx.insert(statusHistories).values({ innovationId: row.id, fromStatus: null, toStatus: "draft", actorId: actor.id });
        await recordAudit(tx, { actorId: actor.id, action: "innovation.create", entityType: "innovation", entityId: row.id });
        return toOwnInnovation(tx, row, true);
      });
    },

    async listOwn(
      actor: AuthUser,
      options: { status?: InnovationStatus; page: number; perPage: number },
    ): Promise<ServiceResult<{ items: OwnInnovationListItem[]; total: number }>> {
      return run(async (tx) => {
        requirePermission(actor, "innovation.read_own");
        const mine = sql`(${innovations.submittedBy} = ${actor.id} or exists (
          select 1 from ${innovationMembers} m join ${researchers} r on r.id = m.researcher_id
          where m.innovation_id = ${innovations.id} and r.user_id = ${actor.id}))`;
        const where = and(
          isNull(innovations.deletedAt),
          mine,
          options.status ? eq(innovations.status, options.status) : undefined,
        );
        const rows = await tx
          .select()
          .from(innovations)
          .where(where)
          .orderBy(desc(innovations.updatedAt), desc(innovations.id))
          .limit(options.perPage)
          .offset((options.page - 1) * options.perPage);
        const [total] = await tx.select({ n: count() }).from(innovations).where(where);
        return {
          items: rows.map((r) => ({
            id: r.id,
            slug: r.slug,
            title: r.title,
            status: r.status,
            isOwner: r.submittedBy === actor.id,
            updatedAt: r.updatedAt.toISOString(),
          })),
          total: total.n,
        };
      });
    },

    async getOwn(actor: AuthUser, id: string): Promise<ServiceResult<OwnInnovation>> {
      return run(async (tx) => {
        const row = await loadAuthorized(tx, actor, id, "read");
        return toOwnInnovation(tx, row, row.submittedBy === actor.id);
      });
    },

    async update(actor: AuthUser, id: string, rawPatch: unknown): Promise<ServiceResult<OwnInnovation>> {
      return run(async (tx) => {
        const row = await loadAuthorized(tx, actor, id, "update", { lock: true });
        const parsed = innovationPatchSchema.safeParse(rawPatch);
        if (!parsed.success) {
          return failure(
            "VALIDATION_ERROR",
            "Data yang dikirim tidak valid.",
            parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message })),
          );
        }
        const patch = parsed.data;

        const set: Partial<typeof innovations.$inferInsert> = {};
        for (const key of TEXT_FIELDS) {
          if (patch[key] !== undefined) Object.assign(set, { [key]: patch[key] });
        }
        // Slug sengaja tidak ikut berubah saat judul diedit (URL stabil, docs/WORKFLOW.md §3 aturan 5).
        if (Object.keys(set).length) await tx.update(innovations).set(set).where(eq(innovations.id, id));
        else await tx.update(innovations).set({ updatedAt: new Date() }).where(eq(innovations.id, id));

        await replaceRelations(tx, id, patch, await currentTeam(tx, id));
        await recordAudit(tx, {
          actorId: actor.id,
          action: "innovation.update",
          entityType: "innovation",
          entityId: id,
          changes: { fields: Object.keys(patch) },
        });
        const [fresh] = await tx.select().from(innovations).where(eq(innovations.id, id));
        return toOwnInnovation(tx, fresh ?? row, (fresh ?? row).submittedBy === actor.id);
      });
    },

    async remove(actor: AuthUser, id: string): Promise<ServiceResult<{ deleted: true }>> {
      return run(async (tx) => {
        await loadAuthorized(tx, actor, id, "delete", { lock: true });
        await tx.update(innovations).set({ deletedAt: new Date() }).where(eq(innovations.id, id));
        await recordAudit(tx, { actorId: actor.id, action: "innovation.delete", entityType: "innovation", entityId: id });
        return { deleted: true as const };
      });
    },

    async submit(actor: AuthUser, id: string): Promise<ServiceResult<OwnInnovation>> {
      return run(async (tx) => {
        const row = await loadAuthorized(tx, actor, id, "submit", { lock: true, conflictAsTransition: true });
        const verdict = validateTransition({ from: row.status, to: "submitted", actor: "owner", actorIsOwner: true });
        if (!verdict.ok) failure("INVALID_TRANSITION", verdict.message);

        const team = await currentTeam(tx, id);
        const cats = await tx.select({ id: innovationCategories.categoryId }).from(innovationCategories).where(eq(innovationCategories.innovationId, id));
        const missing = missingForSubmission({
          title: row.title,
          summary: row.summary,
          categoryIds: cats.map((c) => c.id),
          leadResearcherId: team.lead,
        });
        if (missing.length) failure("VALIDATION_ERROR", "Data belum lengkap untuk diajukan.", missing);

        await tx.update(innovations).set({ status: "submitted" }).where(eq(innovations.id, id));
        await tx.insert(statusHistories).values({ innovationId: id, fromStatus: row.status, toStatus: "submitted", actorId: actor.id });
        await recordAudit(tx, { actorId: actor.id, action: "innovation.submit", entityType: "innovation", entityId: id });
        const [fresh] = await tx.select().from(innovations).where(eq(innovations.id, id));
        return toOwnInnovation(tx, fresh, fresh.submittedBy === actor.id);
      });
    },

    async withdraw(actor: AuthUser, id: string): Promise<ServiceResult<OwnInnovation>> {
      return run(async (tx) => {
        const row = await loadAuthorized(tx, actor, id, "withdraw", { lock: true, conflictAsTransition: true });
        const verdict = validateTransition({ from: row.status, to: "draft", actor: "owner", actorIsOwner: true });
        if (!verdict.ok) failure("INVALID_TRANSITION", verdict.message);

        await tx.update(innovations).set({ status: "draft" }).where(eq(innovations.id, id));
        await tx.insert(statusHistories).values({ innovationId: id, fromStatus: row.status, toStatus: "draft", actorId: actor.id });
        await recordAudit(tx, { actorId: actor.id, action: "innovation.withdraw", entityType: "innovation", entityId: id });
        const [fresh] = await tx.select().from(innovations).where(eq(innovations.id, id));
        return toOwnInnovation(tx, fresh, fresh.submittedBy === actor.id);
      });
    },

    async history(actor: AuthUser, id: string): Promise<ServiceResult<StatusHistoryItem[]>> {
      return run(async (tx) => {
        await loadAuthorized(tx, actor, id, "read");
        const rows = await tx
          .select()
          .from(statusHistories)
          .where(eq(statusHistories.innovationId, id))
          .orderBy(asc(statusHistories.createdAt), asc(statusHistories.id));
        return rows.map((r) => ({
          fromStatus: r.fromStatus,
          toStatus: r.toStatus,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        }));
      });
    },
  };
}

export type InnovationService = ReturnType<typeof createInnovationService>;
