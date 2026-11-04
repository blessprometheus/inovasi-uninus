import { toAuthUser } from "@/modules/auth/auth-user";
import { INNOVATION_STATUSES, type InnovationStatus } from "@/modules/workflow/transitions";
import type { AuthHandlers } from "@/platform/auth/handlers";
import { readJsonBody } from "@/platform/http/body";
import { fail, json, ok } from "@/platform/http/response";
import type { InnovationService, ServiceResult } from "./service";

const MAX_PER_PAGE = 50;

function respond<T>(result: ServiceResult<T>, successStatus = 200): Response {
  return result.ok
    ? json(ok(result.data), { status: successStatus })
    : json(fail(result.code, result.message, result.details));
}

function parseListQuery(url: URL): { page: number; perPage: number; status?: InnovationStatus } | { error: Response } {
  const intParam = (name: string, fallback: number, max: number) => {
    const n = Number.parseInt(url.searchParams.get(name) ?? "", 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
  };
  const status = url.searchParams.get("status");
  if (status && !(INNOVATION_STATUSES as readonly string[]).includes(status)) {
    return {
      error: json(fail("VALIDATION_ERROR", "Status tidak dikenal.", [{ field: "status", message: "Status tidak dikenal." }])),
    };
  }
  return {
    page: intParam("page", 1, 10_000),
    perPage: intParam("per_page", 12, MAX_PER_PAGE),
    status: (status as InnovationStatus | null) ?? undefined,
  };
}

/** Rute `/api/v1/me/innovations`. Otorisasi final tetap di service; di sini hanya sesi dan CSRF. */
export function createInnovationHandlers(deps: { auth: AuthHandlers; service: InnovationService }) {
  const { auth, service } = deps;

  return {
    async list(request: Request): Promise<Response> {
      const gate = await auth.authenticate(request);
      if ("response" in gate) return gate.response;
      const query = parseListQuery(new URL(request.url));
      if ("error" in query) return query.error;

      const result = await service.listOwn(toAuthUser(gate.session.user), query);
      if (!result.ok) return respond(result);
      return json(ok(result.data.items, { page: query.page, per_page: query.perPage, total: result.data.total }));
    },

    async create(request: Request): Promise<Response> {
      const gate = await auth.authenticate(request, { mutation: true });
      if ("response" in gate) return gate.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.createDraft(toAuthUser(gate.session.user), body.body), 201);
    },

    async get(request: Request, id: string): Promise<Response> {
      const gate = await auth.authenticate(request);
      if ("response" in gate) return gate.response;
      return respond(await service.getOwn(toAuthUser(gate.session.user), id));
    },

    async patch(request: Request, id: string): Promise<Response> {
      const gate = await auth.authenticate(request, { mutation: true });
      if ("response" in gate) return gate.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.update(toAuthUser(gate.session.user), id, body.body));
    },

    async remove(request: Request, id: string): Promise<Response> {
      const gate = await auth.authenticate(request, { mutation: true });
      if ("response" in gate) return gate.response;
      return respond(await service.remove(toAuthUser(gate.session.user), id));
    },

    async submit(request: Request, id: string): Promise<Response> {
      const gate = await auth.authenticate(request, { mutation: true });
      if ("response" in gate) return gate.response;
      return respond(await service.submit(toAuthUser(gate.session.user), id));
    },

    async withdraw(request: Request, id: string): Promise<Response> {
      const gate = await auth.authenticate(request, { mutation: true });
      if ("response" in gate) return gate.response;
      return respond(await service.withdraw(toAuthUser(gate.session.user), id));
    },

    async history(request: Request, id: string): Promise<Response> {
      const gate = await auth.authenticate(request);
      if ("response" in gate) return gate.response;
      return respond(await service.history(toAuthUser(gate.session.user), id));
    },
  };
}

export type InnovationHandlers = ReturnType<typeof createInnovationHandlers>;
