import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "@/platform/auth/password";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, checkPasswordPolicy } from "./password-policy";

describe("checkPasswordPolicy", () => {
  it("menerima kata sandi panjang dan beragam", () => {
    expect(checkPasswordPolicy("kopi-hangat-di-pagi-hari-7")).toBeNull();
  });

  it("menolak terlalu pendek atau terlalu panjang, dengan pesan Bahasa Indonesia", () => {
    expect(checkPasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(`Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`);
    expect(checkPasswordPolicy("ab1".repeat(50))).toBe(`Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter.`);
  });

  it("menolak spasi saja dan karakter yang nyaris sama semua", () => {
    expect(checkPasswordPolicy(" ".repeat(14))).not.toBeNull();
    expect(checkPasswordPolicy("aaaaaaaaaaaaaa")).not.toBeNull();
    expect(checkPasswordPolicy("abababababab")).not.toBeNull();
  });

  it("menolak yang sama dengan atau memuat bagian depan email", () => {
    const ctx = { email: "rahmat.hidayat@uninus.ac.id" };
    expect(checkPasswordPolicy("rahmat.hidayat@uninus.ac.id", ctx)).toBe("Kata sandi tidak boleh sama dengan email.");
    expect(checkPasswordPolicy("Rahmat.Hidayat-2026!", ctx)).toBe("Kata sandi tidak boleh memuat bagian depan email Anda.");
    expect(checkPasswordPolicy("kopi-hangat-di-pagi-hari-7", ctx)).toBeNull();
  });

  it("bagian depan email yang terlalu pendek tidak dipakai sebagai larangan", () => {
    expect(checkPasswordPolicy("kopi-hangat-web-pagi-7", { email: "web@uninus.ac.id" })).toBeNull();
  });
});

describe("generateTemporaryPassword", () => {
  it("16 karakter, tanpa karakter membingungkan, dan tidak berulang antar-panggilan", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/^[a-hjkmnp-zA-HJKMNP-Z2-9]+$/);
      expect(checkPasswordPolicy(p)).toBeNull();
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});
