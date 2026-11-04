import { fail, json } from "./response";

/** Batas isi JSON. Form inovasi terbesar (teks panjang + daftar) jauh di bawah ini. */
export const MAX_JSON_BYTES = 256 * 1024;

/** Membaca body JSON dengan batas ukuran. Mengembalikan Response galat siap kirim bila tidak layak. */
export async function readJsonBody(
  request: Request,
  maxBytes: number = MAX_JSON_BYTES,
): Promise<{ body: unknown } | { response: Response }> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return { response: json(fail("UNSUPPORTED_MEDIA_TYPE", "Kirim data dalam format JSON.")) };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return { response: json(fail("PAYLOAD_TOO_LARGE", "Data yang dikirim terlalu besar.")) };
  }
  const text = await request.text();
  // Content-Length bisa dipalsukan atau tidak ada (chunked), jadi ukuran dicek ulang.
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { response: json(fail("PAYLOAD_TOO_LARGE", "Data yang dikirim terlalu besar.")) };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { response: json(fail("VALIDATION_ERROR", "Isi permintaan bukan JSON yang valid.")) };
  }
}
