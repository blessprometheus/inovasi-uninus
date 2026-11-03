const MAX_SLUG_LENGTH = 80;
const FALLBACK = "inovasi";

/** Slug ramah URL dari teks bebas: huruf kecil, tanpa diakritik, tanda hubung tunggal. */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const cut = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  return cut || FALLBACK;
}

/**
 * Membuat slug unik dengan akhiran -2, -3, dst. `exists` dipanggil ke database oleh pemanggil.
 * Slug tidak berubah lagi setelah inovasi pertama kali dipublikasikan (docs/WORKFLOW.md §3).
 */
export async function uniqueSlug(
  title: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  const base = slugify(title);
  if (!(await exists(base))) return base;
  for (let n = 2; n <= maxAttempts + 1; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("Tidak dapat membuat slug unik.");
}
