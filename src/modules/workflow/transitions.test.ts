import { describe, expect, it } from "vitest";
import {
  INNOVATION_STATUSES,
  TRANSITION_RULES,
  isOwnerEditable,
  isPubliclyVisible,
  validateTransition,
  type InnovationStatus,
  type TransitionActor,
} from "./transitions";

const actors: TransitionActor[] = ["owner", "reviewer"];

describe("validateTransition: matriks lengkap", () => {
  it("pasangan di luar tabel selalu ditolak untuk semua aktor", () => {
    for (const from of INNOVATION_STATUSES) {
      for (const to of INNOVATION_STATUSES) {
        const listed = TRANSITION_RULES.some((r) => r.from === from && r.to === to);
        if (listed) continue;
        for (const actor of actors) {
          const res = validateTransition({
            from,
            to,
            actor,
            actorIsOwner: actor === "owner",
            note: "catatan",
          });
          expect(res, `${from} ke ${to} (${actor}) harus ditolak`).toMatchObject({
            ok: false,
            code: "INVALID_TRANSITION",
          });
        }
      }
    }
  });

  it("setiap aturan valid untuk aktor yang tepat dan ditolak untuk aktor yang salah", () => {
    for (const rule of TRANSITION_RULES) {
      const good = validateTransition({
        from: rule.from,
        to: rule.to,
        actor: rule.actor,
        actorIsOwner: rule.actor === "owner",
        note: "catatan",
      });
      expect(good, `${rule.from} ke ${rule.to}`).toEqual({ ok: true });

      const wrongActor: TransitionActor = rule.actor === "owner" ? "reviewer" : "owner";
      const bad = validateTransition({
        from: rule.from,
        to: rule.to,
        actor: wrongActor,
        actorIsOwner: wrongActor === "owner",
        note: "catatan",
      });
      expect(bad, `${rule.from} ke ${rule.to} dengan aktor salah`).toMatchObject({
        ok: false,
        code: "NOT_ALLOWED_FOR_ACTOR",
      });
    }
  });
});

describe("validateTransition: aturan khusus", () => {
  it("aksi pemilik ditolak bila aktor bukan pemilik pengajuan", () => {
    expect(
      validateTransition({ from: "draft", to: "submitted", actor: "owner", actorIsOwner: false }),
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
        validateTransition({ from, to, actor: "reviewer", actorIsOwner: true, note: "x" }),
        `${from} ke ${to}`,
      ).toMatchObject({ ok: false, code: "SELF_REVIEW_FORBIDDEN" });
    }
  });

  it("publikasi tidak terkena pemisahan tugas", () => {
    expect(
      validateTransition({ from: "approved", to: "published", actor: "reviewer", actorIsOwner: true }),
    ).toEqual({ ok: true });
  });

  it("catatan wajib untuk revision_required dan unpublished, termasuk bila hanya spasi", () => {
    const cases: [InnovationStatus, InnovationStatus][] = [
      ["under_review", "revision_required"],
      ["published", "unpublished"],
    ];
    for (const [from, to] of cases) {
      for (const note of [undefined, null, "", "   "]) {
        expect(
          validateTransition({ from, to, actor: "reviewer", actorIsOwner: false, note }),
        ).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
      }
      expect(
        validateTransition({ from, to, actor: "reviewer", actorIsOwner: false, note: "alasan" }),
      ).toEqual({ ok: true });
    }
  });

  it("pesan error berbahasa Indonesia dan tidak membocorkan detail internal", () => {
    const res = validateTransition({
      from: "draft",
      to: "published",
      actor: "reviewer",
      actorIsOwner: false,
    });
    expect(res).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
      message: "Perubahan status tidak diizinkan.",
    });
  });
});

describe("visibilitas dan penguncian edit", () => {
  it("pemilik hanya dapat mengedit saat draft atau revision_required", () => {
    expect(INNOVATION_STATUSES.filter(isOwnerEditable)).toEqual(["draft", "revision_required"]);
  });

  it("hanya published yang terlihat publik", () => {
    expect(INNOVATION_STATUSES.filter(isPubliclyVisible)).toEqual(["published"]);
  });
});
