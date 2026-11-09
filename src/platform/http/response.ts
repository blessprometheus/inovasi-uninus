import { z } from "zod";

// Pesan validasi bawaan Zod dalam Bahasa Indonesia.
z.config(z.locales.id());

/** Format respons API (docs/API_DOCUMENTATION.md §1). */
export interface ApiMeta {
  page?: number;
  per_page?: number;
  total?: number;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export type ApiSuccess<T> = { success: true; data: T; meta?: ApiMeta };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; details?: ApiErrorDetail[] };
};

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ApiErrorCode = keyof typeof ERROR_STATUS;

export function ok<T>(data: T, meta?: ApiMeta): ApiSuccess<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function fail(code: ApiErrorCode, message: string, details?: ApiErrorDetail[]): ApiFailure {
  return { success: false, error: details?.length ? { code, message, details } : { code, message } };
}

/** Mengubah galat Zod menjadi daftar detail per-field, tanpa membocorkan nilai input. */
export function zodDetails(error: z.ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(umum)",
    message: issue.message,
  }));
}

export function validationFailure(error: z.ZodError): ApiFailure {
  return fail("VALIDATION_ERROR", "Data yang dikirim tidak valid.", zodDetails(error));
}

/** Pembungkus Response untuk route handler. */
export function json(body: ApiSuccess<unknown> | ApiFailure, init?: { status?: number }): Response {
  const status = init?.status ?? (body.success ? 200 : ERROR_STATUS[body.error.code as ApiErrorCode] ?? 500);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
