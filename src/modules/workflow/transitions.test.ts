import { describe, expect, it } from "vitest";
import {
  INNOVATION_STATUSES,
  OPERATOR_TRANSITION_RULES,
  TRANSITION_RULES,
  activeRules,
  isOwnerEditable,
  isPubliclyVisible,
  validateTransition,
  type InnovationStatus,
  type TransitionActor,
} from "./transitions";

const actors: TransitionActor[] = ["owner", "reviewer"];

describe("alur operator (portal dosen mati): matriks lengkap", () => {
  it("hanya empat pasangan yang berlaku", () => {
    expect(OPERATOR_TRANSITION_RULES.map((r) => `${r.from}>${r.to}`)).toEqual([
      "draft>published",
      "published>unpublished",
      "unpublished>published",
      "unpublished>draft",
    ]);
  });

  it("pasangan di luar tabel selalu ditolak untuk semua aktor, termasuk semua status lama", () => {
    for (const from of INNOVATION_STATUSES) {
      for (const to of INNOVATION_STATUSES) {
        if (OPERATOR_TRANSITION_RULES.some((r) => r.from === from && r.to === to)) continue;
        for (const actor of actors) {
          const res = validateTransition({
            from,
            to,
            actor,
            actorIsOwner: actor === "owner",
            note: "catatan",
            portal: false,
          });
          expect(res, `${from} ke ${to} (${actor}) harus ditolak`).toMatchObject({
            ok: false,
            code: "INVALID_TRANSITION",
          });
        }
      }
    }
  });

  it("setiap aturan valid untuk operator dan ditolak untuk aktor pemilik", () => {
    for (const rule of OPERATOR_TRANSITION_RULES) {
      expect(
        validateTransition({ ...rule, actor: "reviewer", actorIsOwner: false, note: "catatan", portal: false }),
        `${rule.from} ke ${rule.to}`,
      ).toEqual({ ok: true });
      expect(
        validateTransition({ from: rule.from, to: rule.to, actor: "owner", actorIsOwner: true, note: "x", portal: false }),
        `${rule.from} ke ${rule.to} oleh pemilik`,
      ).toMatchObject({ ok: false, code: "NOT_ALLOWED_FOR_ACTOR" });
    }
  });

  it("operator boleh menerbitkan draft yang ia buat sendiri (tanpa pemisahan tugas)", () => {
    expect(
      validateTransition({ from: "draft", to: "published", actor: "reviewer", actorIsOwner: true, portal: false }),
    ).toEqual({ ok: true });
  });

  it("alasan wajib saat menarik, termasuk bila hanya spasi", () => {
    for (const note of [undefined, null, "", "   "]) {
      expect(
        validateTransition({ from: "published", to: "unpublished", actor: "reviewer", actorIsOwner: false, note, portal: false }),
      ).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    }
    expect(
      validateTransition({ from: "published", to: "unpublished", actor: "reviewer", actorIsOwner: false, note: "alasan", portal: false }),
    ).toEqual({ ok: true });
  });

  it("flag mengikuti RESEARCHER_PORTAL bila tidak ditimpa", () => {
    const before = process.env.RESEARCHER_PORTAL;
    try {
      delete process.env.RESEARCHER_PORTAL;
      expect(activeRules()).toHaveLength(OPERATOR_TRANSITION_RULES.length);
      process.env.RESEARCHER_PORTAL = "1";
      expect(activeRules()).toHaveLength(TRANSITION_RULES.length);
    } finally {
      if (before === undefined) delete process.env.RESEARCHER_PORTAL;
      else process.env.RESEARCHER_PORTAL = before;
    }
  });

  it("pesan error berbahasa Indonesia dan tidak membocorkan detail internal", () => {
    expect(
      validateTransition({ from: "published", to: "draft", actor: "reviewer", actorIsOwner: false, portal: false }),
    ).toEqual({ ok: false, code: "INVALID_TRANSITION", message: "Perubahan status tidak diizinkan." });
  });
});

describe("alur pengajuan dosen (hanya bila RESEARCHER_PORTAL=1)", () => {
  it("pasangan di luar tabel gabungan selalu ditolak untuk semua aktor", () => {
    for (const from of INNOVATION_STATUSES) {
      for (const to of INNOVATION_STATUSES) {
        if (TRANSITION_RULES.some((r) => r.from === from && r.to === to)) continue;
        for (const actor of actors) {
          const res = validateTransition({ from, to, actor, actorIsOwner: actor === "owner", note: "catatan", portal: true });
          expect(res, `${from} ke ${to} (${actor})`).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
        }
      }
    }
  });

  it("alur lama ditolak saat portal mati", () => {
    for (const rule of TRANSITION_RULES) {
      if (OPERATOR_TRANSITION_RULES.includes(rule)) continue;
      expect(
        validateTransition({ ...rule, actorIsOwner: rule.actor === "owner", note: "x", portal: false }),
        `${rule.from} ke ${rule.to}`,
      ).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    }
  });

  it("aksi pemilik ditolak bila aktor bukan pemilik pengajuan", () => {
    expect(
      validateTransition({ from: "draft", to: "submitted", actor: "owner", actorIsOwner: false, portal: true }),
    ).toMatchObject({ ok: false, code: "NOT_ALLOWED_FOR_ACTOR" });
  });

  it("pemisahan tugas: reviewer tidak boleh memeriksa pengajuannya sendiri", () => {
    const cases: [InnovationStatus, InnovationStatus][] = [
      ["submitted", "under_review"],
      ["under_review", "approved"],
      ["under_review", "revision_required"],
    ];
    for (const [from, to] of cases) {
      expect(
        validateTransition({ from, to, actor: "reviewer", actorIsOwner: true, note: "x", portal: true }),
        `${from} ke ${to}`,
      ).toMatchObject({ ok: false, code: "SELF_REVIEW_FORBIDDEN" });
    }
  });

  it("catatan wajib untuk revision_required", () => {
    for (const note of [undefined, null, "", "   "]) {
      expect(
        validateTransition({ from: "under_review", to: "revision_required", actor: "reviewer", actorIsOwner: false, note, portal: true }),
      ).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    }
  });
});

describe("visibilitas dan penguncian edit", () => {
  it("pemilik hanya dapat mengedit saat draft atau revision_required (hanya relevan untuk portal dosen)", () => {
    expect(INNOVATION_STATUSES.filter(isOwnerEditable)).toEqual(["draft", "revision_required"]);
  });

  it("hanya published yang terlihat publik", () => {
    expect(INNOVATION_STATUSES.filter(isPubliclyVisible)).toEqual(["published"]);
  });
});
