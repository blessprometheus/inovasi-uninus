/**
 * State machine status inovasi. Satu-satunya sumber kebenaran: docs/WORKFLOW.md.
 * Fungsi murni (tanpa I/O) agar mudah diuji penuh.
 */
import { isResearcherPortalEnabled } from "@/platform/config/features";

export const INNOVATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "revision_required",
  "approved",
  "published",
  "unpublished",
] as const;

export type InnovationStatus = (typeof INNOVATION_STATUSES)[number];

/** Peran aktor dalam sebuah transisi: pemilik pengajuan, atau reviewer (operator/super admin). */
export type TransitionActor = "owner" | "reviewer";

interface TransitionRule {
  from: InnovationStatus;
  to: InnovationStatus;
  actor: TransitionActor;
  noteRequired: boolean;
  /** Reviewer tidak boleh memproses pengajuannya sendiri (pemisahan tugas). */
  forbidSelfReview: boolean;
}

/**
 * Alur operator (ADR-008, docs/WORKFLOW.md): draft -> published, published <-> unpublished.
 * Selalu aktif.
 */
const OPERATOR_RULES: readonly TransitionRule[] = [
  { from: "draft", to: "published", actor: "reviewer", noteRequired: false, forbidSelfReview: false },
  { from: "published", to: "unpublished", actor: "reviewer", noteRequired: true, forbidSelfReview: false },
  { from: "unpublished", to: "published", actor: "reviewer", noteRequired: false, forbidSelfReview: false },
  { from: "unpublished", to: "draft", actor: "reviewer", noteRequired: false, forbidSelfReview: false },
];

/**
 * Alur pengajuan dosen yang dicabut oleh ADR-008. Hanya berlaku bila RESEARCHER_PORTAL=1 (D-20).
 * approved -> published tetap di sini karena approved hanya dapat dicapai lewat alur ini.
 */
const PORTAL_RULES: readonly TransitionRule[] = [
  { from: "draft", to: "submitted", actor: "owner", noteRequired: false, forbidSelfReview: false },
  { from: "submitted", to: "draft", actor: "owner", noteRequired: false, forbidSelfReview: false },
  { from: "submitted", to: "under_review", actor: "reviewer", noteRequired: false, forbidSelfReview: true },
  { from: "under_review", to: "revision_required", actor: "reviewer", noteRequired: true, forbidSelfReview: true },
  { from: "under_review", to: "approved", actor: "reviewer", noteRequired: false, forbidSelfReview: true },
  { from: "revision_required", to: "submitted", actor: "owner", noteRequired: false, forbidSelfReview: false },
  { from: "approved", to: "published", actor: "reviewer", noteRequired: false, forbidSelfReview: false },
];

/** Aturan yang berlaku. Tanpa argumen, mengikuti flag RESEARCHER_PORTAL. */
export function activeRules(portal: boolean = isResearcherPortalEnabled()): readonly TransitionRule[] {
  return portal ? [...OPERATOR_RULES, ...PORTAL_RULES] : OPERATOR_RULES;
}

/** Semua aturan yang pernah ada, untuk tes matriks. */
export const TRANSITION_RULES: readonly TransitionRule[] = [...OPERATOR_RULES, ...PORTAL_RULES];
export const OPERATOR_TRANSITION_RULES = OPERATOR_RULES;

export type TransitionErrorCode =
  | "INVALID_TRANSITION"
  | "NOT_ALLOWED_FOR_ACTOR"
  | "SELF_REVIEW_FORBIDDEN"
  | "NOTE_REQUIRED";

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: TransitionErrorCode; message: string };

export interface TransitionRequest {
  from: InnovationStatus;
  to: InnovationStatus;
  /** Peran yang dipakai aktor untuk transisi ini. */
  actor: TransitionActor;
  /** Apakah aktor adalah pemilik pengajuan (submitted_by) inovasi ini. */
  actorIsOwner: boolean;
  note?: string | null;
  /** Menimpa flag RESEARCHER_PORTAL (untuk tes). */
  portal?: boolean;
}

const NOT_AUTHORIZED = "Anda tidak berwenang melakukan perubahan status ini.";

/** Memvalidasi satu transisi. Pesan dalam Bahasa Indonesia, tanpa detail internal. */
export function validateTransition(req: TransitionRequest): TransitionResult {
  const rule = activeRules(req.portal).find((r) => r.from === req.from && r.to === req.to);
  if (!rule) {
    return { ok: false, code: "INVALID_TRANSITION", message: "Perubahan status tidak diizinkan." };
  }
  if (rule.actor !== req.actor || (rule.actor === "owner" && !req.actorIsOwner)) {
    return { ok: false, code: "NOT_ALLOWED_FOR_ACTOR", message: NOT_AUTHORIZED };
  }
  if (rule.forbidSelfReview && req.actorIsOwner) {
    return {
      ok: false,
      code: "SELF_REVIEW_FORBIDDEN",
      message: "Pengajuan sendiri harus diperiksa oleh operator lain.",
    };
  }
  if (rule.noteRequired && !req.note?.trim()) {
    return { ok: false, code: "NOTE_REQUIRED", message: "Catatan wajib diisi." };
  }
  return { ok: true };
}

/** Pemilik hanya boleh mengedit isi saat draft atau revision_required (WORKFLOW.md §3 aturan 2). */
export function isOwnerEditable(status: InnovationStatus): boolean {
  return status === "draft" || status === "revision_required";
}

/** Hanya status published yang terlihat publik (WORKFLOW.md §3 aturan 4). */
export function isPubliclyVisible(status: InnovationStatus): boolean {
  return status === "published";
}
