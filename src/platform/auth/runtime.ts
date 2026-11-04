import { getSiteUrl } from "@/platform/config/site";
import { getDb } from "@/platform/db/client";
import { createAuthHandlers, requireAuthSecret, type AuthHandlers } from "./handlers";

let cached: AuthHandlers | undefined;

/** Handler auth untuk route handler Next.js. Dibuat saat request pertama agar build tidak butuh secret. */
export function getAuthHandlers(): AuthHandlers {
  cached ??= createAuthHandlers({ db: getDb(), appUrl: getSiteUrl(), secret: requireAuthSecret() });
  return cached;
}
