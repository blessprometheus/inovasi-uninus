import { toAuthUser } from "@/modules/auth/auth-user";
import type { ServiceResult } from "@/modules/innovations/service-core";
import type { AuthHandlers } from "@/platform/auth/handlers";
import { readJsonBody } from "@/platform/http/body";
import { fail, json, ok } from "@/platform/http/response";
import type { TaxonomyKind, TaxonomyService } from "./service";

function respond<T>(result: ServiceResult<T>, successStatus = 200): Response {
  return result.ok
    ? json(ok(result.data), { status: successStatus })
    : json(fail(result.code, result.message, result.details));
}

/** Rute acuan: publik (hanya yang aktif) dan admin (`taxonomy.manage`, tanpa hapus; nonaktifkan saja). */
export function createTaxonomyHandlers(deps: {
  auth: AuthHandlers;
  service: TaxonomyService;
  /** Dipanggil setelah perubahan berhasil, mis. untuk menyegarkan cache halaman publik. */
  onChange?: () => void;
}) {
  const { auth, service } = deps;
  const changed = <T,>(result: ServiceResult<T>) => {
    if (result.ok) deps.onChange?.();
    return result;
  };

  return {
    async listPublic(kind: TaxonomyKind): Promise<Response> {
      return json(ok(await service.listPublic(kind)));
    },

    async listAdmin(request: Request, kind: TaxonomyKind): Promise<Response> {
      const g = await auth.authenticate(request, { permission: "taxonomy.manage" });
      if ("response" in g) return g.response;
      return respond(await service.list(toAuthUser(g.session.user), kind));
    },

    async create(request: Request, kind: TaxonomyKind): Promise<Response> {
      const g = await auth.authenticate(request, { mutation: true, permission: "taxonomy.manage" });
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(changed(await service.create(toAuthUser(g.session.user), kind, body.body)), 201);
    },

    async update(request: Request, kind: TaxonomyKind, id: string): Promise<Response> {
      const g = await auth.authenticate(request, { mutation: true, permission: "taxonomy.manage" });
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(changed(await service.update(toAuthUser(g.session.user), kind, id, body.body)));
    },
  };
}

export type TaxonomyHandlers = ReturnType<typeof createTaxonomyHandlers>;
