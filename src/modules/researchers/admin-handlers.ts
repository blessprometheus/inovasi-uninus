import { toAuthUser } from "@/modules/auth/auth-user";
import type { ServiceResult } from "@/modules/innovations/service-core";
import type { AuthHandlers } from "@/platform/auth/handlers";
import { readJsonBody } from "@/platform/http/body";
import { fail, json, ok } from "@/platform/http/response";
import type { AdminResearcherService } from "./admin-service";

function respond<T>(result: ServiceResult<T>, successStatus = 200): Response {
  return result.ok
    ? json(ok(result.data), { status: successStatus })
    : json(fail(result.code, result.message, result.details));
}

function intParam(url: URL, name: string, fallback: number, max: number): number {
  const n = Number.parseInt(url.searchParams.get(name) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

/** Rute `/api/v1/admin/researchers`. Gerbang: izin `researcher.manage`. */
export function createAdminResearcherHandlers(deps: { auth: AuthHandlers; service: AdminResearcherService }) {
  const { auth, service } = deps;
  const gate = (request: Request, mutation = false) =>
    auth.authenticate(request, { mutation, permission: "researcher.manage" });

  return {
    async list(request: Request): Promise<Response> {
      const g = await gate(request);
      if ("response" in g) return g.response;
      const url = new URL(request.url);
      const page = intParam(url, "page", 1, 10_000);
      const perPage = intParam(url, "per_page", 20, 50);
      const q = url.searchParams.get("q")?.trim().slice(0, 100) || undefined;
      const result = await service.list(toAuthUser(g.session.user), { q, page, perPage });
      if (!result.ok) return respond(result);
      return json(ok(result.data.items, { page, per_page: perPage, total: result.data.total }));
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

    async remove(request: Request, id: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.remove(toAuthUser(g.session.user), id, body.body));
    },
  };
}

export type AdminResearcherHandlers = ReturnType<typeof createAdminResearcherHandlers>;
