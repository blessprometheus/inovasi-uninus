import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSiteUrl, isIndexable } from "@/platform/config/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // APP_ENV dan APP_URL dibaca saat request, bukan saat build: kalau terkunci di build, produksi
  // bisa terlanjur "Disallow: /" (atau sebaliknya staging terindeks) tergantung env saat build.
  await connection();
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/dosen", "/api/"] },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
