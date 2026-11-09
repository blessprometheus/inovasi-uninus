import { toAuthUser } from "@/modules/auth/auth-user";
import { INNOVATION_STATUSES, type InnovationStatus } from "@/modules/workflow/transitions";
import type { AuthHandlers } from "@/platform/auth/handlers";
import { readJsonBody } from "@/platform/http/body";
import { fail, json, ok } from "@/platform/http/response";
import { z } from "@/platform/http/zod";
import type { AdminInnovationService } from "./admin-service";
import type { ServiceResult } from "./service-core";

function respond<T>(result: ServiceResult<T>, successStatus = 200): Response {
  return result.ok
    ? json(ok(result.data), { status: successStatus })
    : json(fail(result.code, result.message, result.details));
}

function parseQuery(url: URL):
  | { page: number; perPage: number; status?: InnovationStatus; q?: string; facultyId?: string }
  | { error: Response } {
  const intParam = (name: string, fallback: number, max: number) => {
    const n = Number.parseInt(url.searchParams.get(name) ?? "", 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
  };
  const bad = (field: string, message: string) => ({
    error: json(fail("VALIDATION_ERROR", message, [{ field, message }])),
  });
  const status = url.searchParams.get("status");
  if (status && !(INNOVATION_STATUSES as readonly string[]).includes(status)) return bad("status", "Status tidak dikenal.");
  const facultyId = url.searchParams.get("faculty_id") ?? undefined;
  if (facultyId && !z.uuid().safeParse(facultyId).success) return bad("faculty_id", "Fakultas tidak valid.");
  return {
    page: intParam("page", 1, 10_000),
    perPage: intParam("per_page", 20, 50),
    status: (status as InnovationStatus | null) ?? undefined,
    q: url.searchParams.get("q")?.trim().slice(0, 100) || undefined,
    facultyId,
  };
}

/** Rute `/api/v1/admin/innovations`. Gerbang: izin baca-semua; izin per tindakan dicek lagi di service. */
export function createAdminInnovationHandlers(deps: { auth: AuthHandlers; service: AdminInnovationService }) {
  const { auth, service } = deps;
  const gate = (request: Request, mutation = false) =>
    auth.authenticate(request, { mutation, permission: "innovation.read_any" });

  return {
    async list(request: Request): Promise<Response> {
      const g = await gate(request);
      if ("response" in g) return g.response;
      const query = parseQuery(new URL(request.url));
      if ("error" in query) return query.error;
      const result = await service.list(toAuthUser(g.session.user), query);
      if (!result.ok) return respond(result);
      return json(ok(result.data.items, { page: query.page, per_page: query.perPage, total: result.data.total }));
    },

    async create(request: Request): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.create(toAuthUser(g.session.user), body.body), 201);
    },

    async get(request: Request, id: string): Promise<Response> {
      const g = await gate(request);
      if ("response" in g) return g.response;
      return respond(await service.get(toAuthUser(g.session.user), id));
    },

    async patch(request: Request, id: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.update(toAuthUser(g.session.user), id, body.body));
    },

    async transition(request: Request, id: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.transition(toAuthUser(g.session.user), id, body.body));
    },

    async remove(request: Request, id: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.remove(toAuthUser(g.session.user), id, body.body));
    },
  };
}

export type AdminInnovationHandlers = ReturnType<typeof createAdminInnovationHandlers>;
