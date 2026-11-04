import type { SessionUser } from "@/platform/auth/session-store";
import type { AuthUser } from "./authorize";

/** Menyempitkan pengguna sesi menjadi bentuk yang dibutuhkan keputusan otorisasi. */
export function toAuthUser(user: SessionUser): AuthUser {
  return { id: user.id, permissions: user.permissions };
}
