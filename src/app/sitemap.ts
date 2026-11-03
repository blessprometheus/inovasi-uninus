import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { getCatalogProvider } from "@/modules/catalog/providers";
import { getResearcherProvider } from "@/modules/researchers/providers";
import { buildSitemap } from "@/modules/seo/sitemap";
import { getSiteUrl } from "@/platform/config/site";

async function loadSlugs() {
  "use cache";
  // Tag ini di-invalidate saat inovasi dipublikasikan/ditarik (docs/WORKFLOW.md §6).
  cacheTag("sitemap");
  cacheLife("hours");
  const [innovations, researchers] = await Promise.all([
    getCatalogProvider().listSlugs(),
    getResearcherProvider().listSlugs(),
  ]);
  return { innovations, researchers };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // APP_URL dibaca saat request supaya tidak terkunci pada nilai saat build; hanya data yang di-cache.
  await connection();
  const { innovations, researchers } = await loadSlugs();
  return buildSitemap(getSiteUrl(), innovations, researchers);
}
