/**
 * Pemeriksaan jenis berkas unggahan (docs/SECURITY.md §5). Tiga hal harus cocok: ekstensi, MIME yang
 * diklaim browser, dan magic bytes isi berkas. Daftar putih saja. Fungsi murni.
 */

export type DetectedFile = { kind: "image"; mime: "image/jpeg" | "image/png" | "image/webp" } | { kind: "document"; mime: "application/pdf" };

const EXTENSIONS: Record<string, DetectedFile["mime"]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** Jenis berdasarkan isi berkas, bukan nama. Null bila bukan JPEG/PNG/WebP/PDF. */
export function sniffMime(bytes: Uint8Array): DetectedFile["mime"] | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (bytes.length < 12) return null;
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP: "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export type DetectResult = { ok: true; file: DetectedFile } | { ok: false; message: string };

export function detectUpload(input: { filename: string; declaredMime: string; bytes: Uint8Array }): DetectResult {
  const ext = input.filename.toLowerCase().split(".").pop() ?? "";
  const byExt = EXTENSIONS[ext];
  if (!byExt) return { ok: false, message: "Jenis berkas tidak didukung. Gunakan JPG, PNG, WebP, atau PDF." };

  const sniffed = sniffMime(input.bytes);
  if (!sniffed) return { ok: false, message: "Isi berkas bukan JPG, PNG, WebP, atau PDF yang valid." };

  // jpg dan jpeg sama-sama image/jpeg; yang tidak boleh adalah ekstensi/isi/klaim yang saling bertentangan.
  const declared = input.declaredMime.split(";")[0].trim().toLowerCase();
  if (byExt !== sniffed || declared !== sniffed) {
    return { ok: false, message: "Ekstensi, jenis, dan isi berkas tidak sesuai. Berkas ditolak." };
  }
  return sniffed === "application/pdf" ? { ok: true, file: { kind: "document", mime: sniffed } } : { ok: true, file: { kind: "image", mime: sniffed } };
}
