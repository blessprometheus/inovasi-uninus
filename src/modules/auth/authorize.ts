import { isOwnerEditable, type InnovationStatus } from "../workflow/transitions";
import type { PermissionCode } from "./permissions";

/** Pengguna yang sedang login beserta permission gabungan dari seluruh role-nya. */
export interface AuthUser {
  id: string;
  permissions: ReadonlySet<PermissionCode>;
}

/** Bagian inovasi yang dibutuhkan untuk keputusan otorisasi. */
export interface InnovationAccessSubject {
  submittedBy: string;
  status: InnovationStatus;
  /** True bila pengguna tercatat sebagai anggota tim inovasi (hak baca saja). */
  isTeamMember?: boolean;
}

export type InnovationAction = "read" | "update" | "delete" | "submit" | "withdraw";

export type AuthDecision =
  | { allowed: true }
  /** NOT_FOUND dipakai agar keberadaan data milik orang lain tidak bocor (API_DOCUMENTATION.md §8). */
  | { allowed: false; reason: "NOT_FOUND" | "FORBIDDEN"; message: string };

const NOT_FOUND: AuthDecision = { allowed: false, reason: "NOT_FOUND", message: "Data tidak ditemukan." };

export function can(user: AuthUser | null, permission: PermissionCode): boolean {
  return user?.permissions.has(permission) ?? false;
}

const ANY_PERMISSION: Record<InnovationAction, PermissionCode> = {
  read: "innovation.read_any",
  update: "innovation.update_any",
  delete: "innovation.delete_any",
  // Mengajukan/menarik adalah hak pemilik; tidak ada versi "any" (reviewer memakai transisi workflow).
  submit: "innovation.review",
  withdraw: "innovation.review",
};

const OWN_PERMISSION: Record<InnovationAction, PermissionCode> = {
  read: "innovation.read_own",
  update: "innovation.update_own",
  delete: "innovation.delete_own",
  submit: "innovation.submit_own",
  withdraw: "innovation.withdraw_own",
};

/**
 * Keputusan akses ke satu inovasi. Dicek di server, bukan hanya di UI (docs/SECURITY.md §3).
 * - Reviewer (permission *_any) dapat read/update/delete tanpa batas kepemilikan.
 * - Pemilik dibatasi status: edit hanya saat draft/revision_required, hapus hanya saat draft,
 *   ajukan hanya dari draft/revision_required, tarik hanya dari submitted.
 * - Selain itu: NOT_FOUND (tidak membocorkan keberadaan).
 */
export function authorizeInnovation(
  user: AuthUser | null,
  action: InnovationAction,
  innovation: InnovationAccessSubject,
): AuthDecision {
  if (!user) return NOT_FOUND;

  if (action === "read" || action === "update" || action === "delete") {
    if (can(user, ANY_PERMISSION[action])) return { allowed: true };
  }

  const isOwner = innovation.submittedBy === user.id;

  if (action === "read" && !isOwner && innovation.isTeamMember && can(user, "innovation.read_own")) {
    return { allowed: true };
  }

  if (!isOwner || !can(user, OWN_PERMISSION[action])) return NOT_FOUND;

  const locked = (message: string): AuthDecision => ({ allowed: false, reason: "FORBIDDEN", message });
  switch (action) {
    case "read":
      return { allowed: true };
    case "update":
      return isOwnerEditable(innovation.status)
        ? { allowed: true }
        : locked("Inovasi tidak dapat diedit pada status ini.");
    case "delete":
      return innovation.status === "draft"
        ? { allowed: true }
        : locked("Hanya draft yang dapat dihapus.");
    case "submit":
      return isOwnerEditable(innovation.status)
        ? { allowed: true }
        : locked("Inovasi tidak dapat diajukan pada status ini.");
    case "withdraw":
      return innovation.status === "submitted"
        ? { allowed: true }
        : locked("Pengajuan hanya dapat ditarik sebelum diperiksa.");
  }
}
