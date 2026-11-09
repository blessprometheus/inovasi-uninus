import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { createAdminInnovationHandlers, type AdminInnovationHandlers } from "@/modules/innovations/admin-handlers";
import { createAdminInnovationService } from "@/modules/innovations/admin-service";
import { createInnovationHandlers, type InnovationHandlers } from "@/modules/innovations/handlers";
import { createInnovationService } from "@/modules/innovations/service";
import { createAdminResearcherHandlers, type AdminResearcherHandlers } from "@/modules/researchers/admin-handlers";
import { createAdminResearcherService } from "@/modules/researchers/admin-service";
import { createResearcherLookup, createResearcherLookupHandler } from "@/modules/researchers/lookup";
import { createFilesHandlers, type FilesHandlers } from "@/modules/files/handlers";
import { createFilesService } from "@/modules/files/service";
import { createUsersHandlers, type UsersHandlers } from "@/modules/users/handlers";
import { createUsersService } from "@/modules/users/service";
import { createTaxonomyHandlers, type TaxonomyHandlers } from "@/modules/taxonomy/handlers";
import { createTaxonomyService } from "@/modules/taxonomy/service";
import { isResearcherPortalEnabled } from "@/platform/config/features";
import { getSiteUrl } from "@/platform/config/site";
import { getStorage, getUploadLimits } from "@/platform/config/uploads";
import { getDb } from "@/platform/db/client";
import { fail, json } from "@/platform/http/response";
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

/**
 * Portal dosen dimatikan sejak ADR-008 (flag RESEARCHER_PORTAL). Saat mati, semua rute `/me/*`
 * menjawab 404 seolah tidak ada, dan tidak menyentuh sesi maupun database.
 */
function gateByPortal<H extends { [K in keyof H]: (...args: never[]) => Promise<Response> }>(handlers: H): H {
  const wrapped = Object.fromEntries(
    Object.entries<(...args: never[]) => Promise<Response>>(handlers).map(([name, fn]) => [
      name,
      async (...args: never[]) => {
        // Tanpa ini Next merender rute yang tidak menyentuh request ini sebagai statis saat build,
        // sehingga 404 "portal mati" tertanam dan tetap muncul walau flag dinyalakan kemudian.
        await connection();
        return isResearcherPortalEnabled() ? fn(...args) : json(fail("NOT_FOUND", "Data tidak ditemukan."));
      },
    ]),
  );
  return wrapped as H; // Bentuk hasil identik dengan input; hanya isi fungsinya dibungkus.
}

function gateOne<F extends (...args: never[]) => Promise<Response>>(fn: F): F {
  return gateByPortal({ fn }).fn;
}

/** Layanan untuk Server Component (halaman memanggil layanan langsung, bukan lewat HTTP). */
export const getInnovationService = () => createInnovationService(getDb());
export const getTaxonomyService = () => createTaxonomyService(getDb());
export const getResearcherLookup = () => createResearcherLookup(getDb());

let cachedInnovations: InnovationHandlers | undefined;

/** Handler `/api/v1/me/innovations`, memakai gerbang sesi/CSRF yang sama dengan auth. */
export function getInnovationHandlers(): InnovationHandlers {
  cachedInnovations ??= gateByPortal(
    createInnovationHandlers({
      auth: getAuthHandlers(),
      service: createInnovationService(getDb()),
    }),
  );
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

export const getAdminResearcherService = () =>
  createAdminResearcherService(getDb(), { onPublicChange: refreshPublicCache });

let cachedAdminResearchers: AdminResearcherHandlers | undefined;

/** Handler `/api/v1/admin/researchers` (CRUD peneliti oleh operator, ADR-008). */
export function getAdminResearcherHandlers(): AdminResearcherHandlers {
  cachedAdminResearchers ??= createAdminResearcherHandlers({
    auth: getAuthHandlers(),
    service: createAdminResearcherService(getDb(), { onPublicChange: refreshPublicCache }),
  });
  return cachedAdminResearchers;
}

let cachedLookup: ReturnType<typeof createResearcherLookupHandler> | undefined;

/** `GET /api/v1/me/researchers?q=` untuk pemilih anggota tim. */
export function getResearcherLookupHandler() {
  cachedLookup ??= gateOne(
    createResearcherLookupHandler({
      auth: getAuthHandlers(),
      lookup: createResearcherLookup(getDb()),
    }),
  );
  return cachedLookup;
}

export const getFilesService = () =>
  createFilesService(getDb(), getStorage(), getUploadLimits(), { onPublicChange: refreshPublicCache });

let cachedFiles: FilesHandlers | undefined;

/** Handler berkas: unggah/kelola (admin) dan penyajian (publik dan admin). */
export function getFilesHandlers(): FilesHandlers {
  cachedFiles ??= createFilesHandlers({
    auth: getAuthHandlers(),
    service: getFilesService(),
    limits: getUploadLimits(),
  });
  return cachedFiles;
}

export const getUsersService = () => createUsersService(getDb());

let cachedUsers: UsersHandlers | undefined;

/** Handler `/api/v1/admin/users` (khusus super admin). */
export function getUsersHandlers(): UsersHandlers {
  cachedUsers ??= createUsersHandlers({ auth: getAuthHandlers(), service: createUsersService(getDb()) });
  return cachedUsers;
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
