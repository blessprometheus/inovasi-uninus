import { revalidateTag } from "next/cache";
import { createAdminInnovationHandlers, type AdminInnovationHandlers } from "@/modules/innovations/admin-handlers";
import { createAdminInnovationService } from "@/modules/innovations/admin-service";
import { createInnovationHandlers, type InnovationHandlers } from "@/modules/innovations/handlers";
import { createInnovationService } from "@/modules/innovations/service";
import { createResearcherLookup, createResearcherLookupHandler } from "@/modules/researchers/lookup";
import { createTaxonomyHandlers, type TaxonomyHandlers } from "@/modules/taxonomy/handlers";
import { createTaxonomyService } from "@/modules/taxonomy/service";
import { getSiteUrl } from "@/platform/config/site";
import { getDb } from "@/platform/db/client";
import { createAuthHandlers, requireAuthSecret, type AuthHandlers } from "./handlers";

let cached: AuthHandlers | undefined;

/** Handler auth untuk route handler Next.js. Dibuat saat request pertama agar build tidak butuh secret. */
export function getAuthHandlers(): AuthHandlers {
  cached ??= createAuthHandlers({ db: getDb(), appUrl: getSiteUrl(), secret: requireAuthSecret() });
  return cached;
}

/**
 * Halaman publik dan sitemap disegarkan segera (`expire: 0`, tanpa menyajikan data basi) karena
 * konten yang ditarik tidak boleh terus tampil (docs/WORKFLOW.md §3 aturan 6).
 */
function refreshPublicCache() {
  revalidateTag("catalog", { expire: 0 });
  revalidateTag("sitemap", { expire: 0 });
}

/** Layanan untuk Server Component (halaman memanggil layanan langsung, bukan lewat HTTP). */
export const getInnovationService = () => createInnovationService(getDb());
export const getTaxonomyService = () => createTaxonomyService(getDb());
export const getResearcherLookup = () => createResearcherLookup(getDb());

let cachedInnovations: InnovationHandlers | undefined;

/** Handler `/api/v1/me/innovations`, memakai gerbang sesi/CSRF yang sama dengan auth. */
export function getInnovationHandlers(): InnovationHandlers {
  cachedInnovations ??= createInnovationHandlers({
    auth: getAuthHandlers(),
    service: createInnovationService(getDb()),
  });
  return cachedInnovations;
}

/** Layanan admin untuk Server Component (hook penyegaran cache dipasang agar konsisten dengan rute API). */
export const getAdminInnovationService = () =>
  createAdminInnovationService(getDb(), createInnovationService(getDb()), { onPublicChange: refreshPublicCache });

let cachedAdmin: AdminInnovationHandlers | undefined;

/** Handler `/api/v1/admin/innovations`. */
export function getAdminInnovationHandlers(): AdminInnovationHandlers {
  cachedAdmin ??= createAdminInnovationHandlers({
    auth: getAuthHandlers(),
    service: createAdminInnovationService(getDb(), createInnovationService(getDb()), {
      onPublicChange: refreshPublicCache,
    }),
  });
  return cachedAdmin;
}

let cachedLookup: ReturnType<typeof createResearcherLookupHandler> | undefined;

/** `GET /api/v1/me/researchers?q=` untuk pemilih anggota tim. */
export function getResearcherLookupHandler() {
  cachedLookup ??= createResearcherLookupHandler({
    auth: getAuthHandlers(),
    lookup: createResearcherLookup(getDb()),
  });
  return cachedLookup;
}

let cachedTaxonomy: TaxonomyHandlers | undefined;

/** Handler acuan (fakultas, prodi, kategori, jenis): publik dan admin. */
export function getTaxonomyHandlers(): TaxonomyHandlers {
  cachedTaxonomy ??= createTaxonomyHandlers({
    auth: getAuthHandlers(),
    service: createTaxonomyService(getDb()),
    onChange: refreshPublicCache,
  });
  return cachedTaxonomy;
}
