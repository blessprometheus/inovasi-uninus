/** Pemanggil API internal dari komponen klien (docs/API_DOCUMENTATION.md §1-2). */

export interface ApiFieldError {
  field: string;
  message: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; details: ApiFieldError[] };

/**
 * Metode pengubah data membawa token CSRF; header Origin ditambahkan otomatis oleh browser untuk
 * permintaan satu-asal. Galat jaringan dikembalikan sebagai hasil gagal, bukan dilempar.
 */
export async function apiRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { csrf?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(options.csrf ? { "x-csrf-token": options.csrf } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as
      | { success: true; data: T }
      | { success: false; error: { code: string; message: string; details?: ApiFieldError[] } }
      | null;
    if (json?.success) return { ok: true, data: json.data };
    return {
      ok: false,
      status: res.status,
      code: json && !json.success ? json.error.code : "INTERNAL_ERROR",
      message: json && !json.success ? json.error.message : "Terjadi kesalahan pada server.",
      details: json && !json.success ? (json.error.details ?? []) : [],
    };
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.",
      details: [],
    };
  }
}
