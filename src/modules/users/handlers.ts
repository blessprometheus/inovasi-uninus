import { toAuthUser } from "@/modules/auth/auth-user";
import type { ServiceResult } from "@/modules/innovations/service-core";
import type { AuthHandlers } from "@/platform/auth/handlers";
import { readJsonBody } from "@/platform/http/body";
import { fail, json, ok } from "@/platform/http/response";
import type { UsersService } from "./service";

function respond<T>(result: ServiceResult<T>, successStatus = 200): Response {
  return result.ok
    ? json(ok(result.data), { status: successStatus })
    : json(fail(result.code, result.message, result.details));
}

/**
 * Rute `/api/v1/admin/users`. Gerbang: izin `user.manage` (khusus super admin). Respons yang memuat
 * kata sandi sementara tidak boleh di-cache; `json()` sudah memasang `Cache-Control: no-store`.
 */
export function createUsersHandlers(deps: { auth: AuthHandlers; service: UsersService }) {
  const { auth, service } = deps;
  const gate = (request: Request, mutation = false) =>
    auth.authenticate(request, { mutation, permission: "user.manage" });

  return {
    async list(request: Request): Promise<Response> {
      const g = await gate(request);
      if ("response" in g) return g.response;
      return respond(await service.list(toAuthUser(g.session.user)));
    },

    async create(request: Request): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.create(toAuthUser(g.session.user), body.body), 201);
    },

    async patch(request: Request, id: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.update(toAuthUser(g.session.user), id, body.body));
    },

    async resetPassword(request: Request, id: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      return respond(await service.resetPassword(toAuthUser(g.session.user), id));
    },
  };
}

export type UsersHandlers = ReturnType<typeof createUsersHandlers>;
