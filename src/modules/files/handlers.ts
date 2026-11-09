import { toAuthUser } from "@/modules/auth/auth-user";
import type { ServiceResult } from "@/modules/innovations/service-core";
import type { AuthHandlers } from "@/platform/auth/handlers";
import type { UploadLimits } from "@/platform/config/uploads";
import { readJsonBody } from "@/platform/http/body";
import { fail, json, ok } from "@/platform/http/response";
import type { FileContent, FilesService } from "./service";

function respond<T>(result: ServiceResult<T>, successStatus = 200): Response {
  return result.ok
    ? json(ok(result.data), { status: successStatus })
    : json(fail(result.code, result.message, result.details));
}

/** Header penyajian: berkas unggahan tidak boleh dieksekusi sebagai halaman atau skrip (SECURITY.md §5). */
function fileResponse(content: FileContent, cache: string, request: Request): Response {
  const etag = content.sha256 ? `"${content.sha256}"` : null;
  const headers: Record<string, string> = {
    "Content-Type": content.mime,
    "X-Content-Type-Options": "nosniff",
    // Menetralkan skrip/pemuatan sumber lain bila berkas dibuka langsung (mis. PDF dengan JavaScript).
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Content-Disposition": `inline; filename="${content.filename}"`,
    "Cache-Control": cache,
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (etag) headers.ETag = etag;
  // Otorisasi sudah lolos sebelum sampai sini, jadi 304 aman dan menghemat transfer.
  if (etag && request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(content.bytes), { status: 200, headers: { ...headers, "Content-Length": String(content.bytes.length) } });
}

const NOT_FOUND = () => json(fail("NOT_FOUND", "Data tidak ditemukan."));

export function createFilesHandlers(deps: { auth: AuthHandlers; service: FilesService; limits: UploadLimits }) {
  const { auth, service, limits } = deps;
  const gate = (request: Request, mutation = false) =>
    auth.authenticate(request, { mutation, permission: "file.manage_any" });
  /** Selisih untuk field teks dan batas multipart; ukuran berkas yang sebenarnya diperiksa di layanan. */
  const MAX_REQUEST_BYTES = Math.max(limits.maxImageBytes, limits.maxDocumentBytes) + 512 * 1024;

  const variantOf = (request: Request) => (new URL(request.url).searchParams.get("v") === "thumb" ? "thumb" : "display");

  return {
    /** `GET /api/v1/files/{id}`: hanya berkas publik milik inovasi yang terbit. Tanpa login. */
    async servePublic(request: Request, id: string): Promise<Response> {
      const content = await service.read({ type: "public" }, id, variantOf(request));
      return content ? fileResponse(content, "no-cache", request) : NOT_FOUND();
    },

    /** `GET /api/v1/admin/files/{id}`: semua berkas, untuk pratinjau di panel admin. */
    async serveAdmin(request: Request, id: string): Promise<Response> {
      const g = await gate(request);
      if ("response" in g) return g.response;
      const content = await service.read({ type: "admin", actor: toAuthUser(g.session.user) }, id, variantOf(request));
      return content ? fileResponse(content, "private, no-cache", request) : NOT_FOUND();
    },

    async list(request: Request, innovationId: string): Promise<Response> {
      const g = await gate(request);
      if ("response" in g) return g.response;
      return respond(await service.list(toAuthUser(g.session.user), innovationId));
    },

    /** `POST /api/v1/admin/innovations/{id}/files` (multipart/form-data). */
    async upload(request: Request, innovationId: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;

      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
        return json(fail("UNSUPPORTED_MEDIA_TYPE", "Gunakan multipart/form-data."));
      }
      // Ditolak sebelum body dibaca bila Content-Length sudah melebihi batas.
      const declared = Number(request.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
        return json(fail("PAYLOAD_TOO_LARGE", "Berkas terlalu besar."));
      }

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return json(fail("VALIDATION_ERROR", "Isi permintaan tidak valid."));
      }
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return json(fail("VALIDATION_ERROR", "Pilih berkas yang akan diunggah.", [{ field: "file", message: "Pilih berkas yang akan diunggah." }]));
      }
      if (file.size > MAX_REQUEST_BYTES) return json(fail("PAYLOAD_TOO_LARGE", "Berkas terlalu besar."));

      const text = (name: string) => {
        const v = form.get(name);
        return typeof v === "string" ? v : null;
      };
      const result = await service.upload(toAuthUser(g.session.user), innovationId, {
        filename: file.name,
        declaredMime: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
        title: text("title"),
        altText: text("altText"),
        visibility: text("visibility") || null,
        isCover: text("isCover") === "true",
      });
      return respond(result, 201);
    },

    async patch(request: Request, fileId: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      const body = await readJsonBody(request);
      if ("response" in body) return body.response;
      return respond(await service.update(toAuthUser(g.session.user), fileId, body.body));
    },

    async remove(request: Request, fileId: string): Promise<Response> {
      const g = await gate(request, true);
      if ("response" in g) return g.response;
      return respond(await service.remove(toAuthUser(g.session.user), fileId));
    },
  };
}

export type FilesHandlers = ReturnType<typeof createFilesHandlers>;
