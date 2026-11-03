import { describe, expect, it } from "vitest";
import { authorizeInnovation, can, type AuthUser, type InnovationAction } from "./authorize";
import { ROLE_PERMISSIONS, type RoleCode } from "./permissions";
import { INNOVATION_STATUSES, type InnovationStatus } from "../workflow/transitions";

function userWithRoles(id: string, ...roles: RoleCode[]): AuthUser {
  return { id, permissions: new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r])) };
}

const owner = userWithRoles("u-owner", "researcher");
const stranger = userWithRoles("u-stranger", "researcher");
const operator = userWithRoles("u-op", "operator");
const actions: InnovationAction[] = ["read", "update", "delete", "submit", "withdraw"];

const inno = (status: InnovationStatus, submittedBy = "u-owner") => ({ submittedBy, status });

describe("can", () => {
  it("menolak pengguna tanpa sesi", () => {
    expect(can(null, "public.read")).toBe(false);
  });
  it("memeriksa permission, bukan role", () => {
    expect(can(owner, "innovation.create")).toBe(true);
    expect(can(owner, "innovation.review")).toBe(false);
    expect(can(operator, "innovation.review")).toBe(true);
    expect(can(operator, "user.manage")).toBe(false);
  });
});

describe("authorizeInnovation: tanpa sesi dan orang lain", () => {
  it("tanpa sesi selalu NOT_FOUND untuk semua aksi dan status", () => {
    for (const a of actions) {
      for (const s of INNOVATION_STATUSES) {
        expect(authorizeInnovation(null, a, inno(s)), `${a}/${s}`).toMatchObject({
          allowed: false,
          reason: "NOT_FOUND",
        });
      }
    }
  });

  it("dosen lain tidak dapat melakukan aksi apa pun dan mendapat NOT_FOUND (bukan FORBIDDEN)", () => {
    for (const a of actions) {
      for (const s of INNOVATION_STATUSES) {
        expect(authorizeInnovation(stranger, a, inno(s)), `${a}/${s}`).toMatchObject({
          allowed: false,
          reason: "NOT_FOUND",
        });
      }
    }
  });
});

describe("authorizeInnovation: pemilik dibatasi status", () => {
  const editable: InnovationStatus[] = ["draft", "revision_required"];

  it("dapat membaca di semua status", () => {
    for (const s of INNOVATION_STATUSES) {
      expect(authorizeInnovation(owner, "read", inno(s))).toEqual({ allowed: true });
    }
  });

  it("edit dan ajukan hanya saat draft atau revision_required", () => {
    for (const s of INNOVATION_STATUSES) {
      for (const a of ["update", "submit"] as const) {
        const res = authorizeInnovation(owner, a, inno(s));
        if (editable.includes(s)) expect(res, `${a}/${s}`).toEqual({ allowed: true });
        else expect(res, `${a}/${s}`).toMatchObject({ allowed: false, reason: "FORBIDDEN" });
      }
    }
  });

  it("hapus hanya saat draft", () => {
    for (const s of INNOVATION_STATUSES) {
      const res = authorizeInnovation(owner, "delete", inno(s));
      if (s === "draft") expect(res).toEqual({ allowed: true });
      else expect(res, s).toMatchObject({ allowed: false, reason: "FORBIDDEN" });
    }
  });

  it("tarik kembali hanya saat submitted", () => {
    for (const s of INNOVATION_STATUSES) {
      const res = authorizeInnovation(owner, "withdraw", inno(s));
      if (s === "submitted") expect(res).toEqual({ allowed: true });
      else expect(res, s).toMatchObject({ allowed: false, reason: "FORBIDDEN" });
    }
  });
});

describe("authorizeInnovation: operator dan anggota tim", () => {
  it("operator dapat read, update, delete inovasi siapa pun di status apa pun", () => {
    for (const s of INNOVATION_STATUSES) {
      for (const a of ["read", "update", "delete"] as const) {
        expect(authorizeInnovation(operator, a, inno(s, "u-someone")), `${a}/${s}`).toEqual({
          allowed: true,
        });
      }
    }
  });

  it("operator tidak dapat mengajukan atau menarik pengajuan milik orang lain (itu hak pemilik)", () => {
    for (const a of ["submit", "withdraw"] as const) {
      expect(authorizeInnovation(operator, a, inno("draft", "u-someone"))).toMatchObject({
        allowed: false,
        reason: "NOT_FOUND",
      });
    }
  });

  it("anggota tim hanya dapat membaca, tidak mengubah", () => {
    const subject = { submittedBy: "u-owner", status: "draft" as const, isTeamMember: true };
    expect(authorizeInnovation(stranger, "read", subject)).toEqual({ allowed: true });
    for (const a of ["update", "delete", "submit", "withdraw"] as const) {
      expect(authorizeInnovation(stranger, a, subject), a).toMatchObject({ allowed: false });
    }
  });

  it("pengguna tanpa permission _own ditolak walau menjadi pemilik (mis. role dicabut)", () => {
    const noRole: AuthUser = { id: "u-owner", permissions: new Set() };
    expect(authorizeInnovation(noRole, "read", inno("draft"))).toMatchObject({
      allowed: false,
      reason: "NOT_FOUND",
    });
  });

  it("pesan penolakan berbahasa Indonesia", () => {
    const res = authorizeInnovation(owner, "update", inno("published"));
    expect(res).toEqual({
      allowed: false,
      reason: "FORBIDDEN",
      message: "Inovasi tidak dapat diedit pada status ini.",
    });
  });
});
