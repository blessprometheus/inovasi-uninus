import { describe, expect, it } from "vitest";
import { collaborationRequestSchema } from "./schemas";
import { fail, json, ok, validationFailure } from "../../platform/http/response";

const valid = {
  name: "Budi Santoso",
  email: "  Budi@Contoh.CO.ID ",
  organization: "PT Contoh Maju",
  message: "Kami tertarik memanfaatkan hasil penelitian ini.",
  consent: true as const,
};

describe("collaborationRequestSchema", () => {
  it("menerima data valid dan menormalkan email (trim + huruf kecil)", () => {
    const res = collaborationRequestSchema.parse(valid);
    expect(res.email).toBe("budi@contoh.co.id");
  });

  it("persetujuan wajib bernilai true", () => {
    for (const consent of [false, undefined, "true", 1]) {
      const res = collaborationRequestSchema.safeParse({ ...valid, consent });
      expect(res.success, String(consent)).toBe(false);
    }
    const res = collaborationRequestSchema.safeParse({ ...valid, consent: false });
    expect(!res.success && res.error.issues[0].message).toBe("Persetujuan penyimpanan data wajib dicentang.");
  });

  it("menolak email tidak valid dan field wajib kosong", () => {
    expect(collaborationRequestSchema.safeParse({ ...valid, email: "bukan-email" }).success).toBe(false);
    expect(collaborationRequestSchema.safeParse({ ...valid, name: " " }).success).toBe(false);
    expect(collaborationRequestSchema.safeParse({ ...valid, message: "pendek" }).success).toBe(false);
  });

  it("telepon opsional, kosong menjadi null, dan hanya karakter yang wajar", () => {
    expect(collaborationRequestSchema.parse({ ...valid, phone: "" }).phone).toBeNull();
    expect(collaborationRequestSchema.safeParse({ ...valid, phone: "+62 812-3456-789" }).success).toBe(true);
    expect(collaborationRequestSchema.safeParse({ ...valid, phone: "<script>" }).success).toBe(false);
  });

  it("honeypot diterima di schema (ditangani di handler) dan field asing ditolak", () => {
    expect(collaborationRequestSchema.safeParse({ ...valid, website: "http://spam" }).success).toBe(true);
    expect(collaborationRequestSchema.safeParse({ ...valid, status: "closed" }).success).toBe(false);
  });

  it("membatasi panjang pesan", () => {
    expect(collaborationRequestSchema.safeParse({ ...valid, message: "a".repeat(1001) }).success).toBe(false);
  });
});

describe("format respons API", () => {
  it("ok membungkus data dan meta", () => {
    expect(ok({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
    expect(ok([], { page: 1, per_page: 12, total: 0 })).toEqual({
      success: true,
      data: [],
      meta: { page: 1, per_page: 12, total: 0 },
    });
  });

  it("fail memuat kode dan pesan, details hanya bila ada", () => {
    expect(fail("NOT_FOUND", "Data tidak ditemukan.")).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Data tidak ditemukan." },
    });
  });

  it("validationFailure berisi detail per-field tanpa nilai input", () => {
    const res = collaborationRequestSchema.safeParse({ ...valid, email: "rahasia-salah" });
    if (res.success) throw new Error("seharusnya gagal");
    const body = validationFailure(res.error);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details?.[0].field).toBe("email");
    expect(JSON.stringify(body)).not.toContain("rahasia-salah");
  });

  it("json memetakan kode error ke status HTTP dan melarang cache", async () => {
    const r1 = json(fail("FORBIDDEN", "x"));
    expect(r1.status).toBe(403);
    expect(r1.headers.get("Cache-Control")).toBe("no-store");
    expect(json(fail("INVALID_TRANSITION", "x")).status).toBe(409);
    expect(json(fail("RATE_LIMITED", "x")).status).toBe(429);
    const r2 = json(ok({ a: 1 }), { status: 201 });
    expect(r2.status).toBe(201);
    expect(await r2.json()).toEqual({ success: true, data: { a: 1 } });
  });
});
