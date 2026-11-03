import type { MetadataRoute } from "next";

interface SlugEntry {
  slug: string;
  updatedAt: string;
}

/**
 * Susun entri sitemap. Hanya data yang sudah publik yang boleh masuk (AC-04), jadi sumber datanya
 * wajib provider publik. Halaman statis tidak diberi lastModified karena tidak ada tanggal ubah yang jujur.
 */
export function buildSitemap(
  baseUrl: string,
  innovations: SlugEntry[],
  researchers: SlugEntry[],
): MetadataRoute.Sitemap {
  const entry = (path: string, e?: SlugEntry): MetadataRoute.Sitemap[number] => ({
    url: `${baseUrl}${path}`,
    ...(e ? { lastModified: new Date(e.updatedAt) } : {}),
  });
  return [
    entry("/"),
    entry("/inovasi"),
    entry("/peneliti"),
    entry("/tentang"),
    ...innovations.map((e) => entry(`/inovasi/${e.slug}`, e)),
    ...researchers.map((e) => entry(`/peneliti/${e.slug}`, e)),
  ];
}
