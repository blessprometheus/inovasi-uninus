import { createInnovationHandlers, type InnovationHandlers } from "@/modules/innovations/handlers";
import { createInnovationService } from "@/modules/innovations/service";
import { getSiteUrl } from "@/platform/config/site";
import { getDb } from "@/platform/db/client";
import { createAuthHandlers, requireAuthSecret, type AuthHandlers } from "./handlers";

let cached: AuthHandlers | undefined;

/** Handler auth untuk route handler Next.js. Dibuat saat request pertama agar build tidak butuh secret. */
export function getAuthHandlers(): AuthHandlers {
  cached ??= createAuthHandlers({ db: getDb(), appUrl: getSiteUrl(), secret: requireAuthSecret() });
  return cached;
}

let cachedInnovations: InnovationHandlers | undefined;

/** Handler `/api/v1/me/innovations`, memakai gerbang sesi/CSRF yang sama dengan auth. */
export function getInnovationHandlers(): InnovationHandlers {
  cachedInnovations ??= createInnovationHandlers({
    auth: getAuthHandlers(),
    service: createInnovationService(getDb()),
  });
  return cachedInnovations;
}
