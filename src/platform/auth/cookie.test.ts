import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  readSessionToken,
  serializeSessionCookie,
  sessionCookieName,
} from "./cookie";

const HTTPS = "https://inovasi.uninus.ac.id";
const HTTP = "http://localhost:3000";
const TOKEN = "a".repeat(43);

describe("cookie sesi", () => {
  it("https memakai awalan __Host- dan Secure; http tidak", () => {
    expect(sessionCookieName(HTTPS)).toBe("__Host-inovasi_session");
    expect(sessionCookieName(HTTP)).toBe("inovasi_session");
    expect(serializeSessionCookie(TOKEN, HTTPS, 60)).toContain("Secure");
    expect(serializeSessionCookie(TOKEN, HTTP, 60)).not.toContain("Secure");
  });

  it("selalu HttpOnly, SameSite=Lax, Path=/ dan tanpa Domain (syarat __Host-)", () => {
    for (const url of [HTTPS, HTTP]) {
      const c = serializeSessionCookie(TOKEN, url, 120.9);
      expect(c).toContain("HttpOnly");
      expect(c).toContain("SameSite=Lax");
      expect(c).toContain("Path=/");
      expect(c).toContain("Max-Age=120");
      expect(c).not.toMatch(/Domain=/i);
    }
  });

  it("menghapus cookie dengan Max-Age=0 dan nilai kosong", () => {
    const c = clearSessionCookie(HTTPS);
    expect(c.startsWith("__Host-inovasi_session=;")).toBe(true);
    expect(c).toContain("Max-Age=0");
  });

  it("membaca token dari header Cookie di antara cookie lain", () => {
    expect(readSessionToken(`tema=gelap; inovasi_session=${TOKEN}; lain=1`, HTTP)).toBe(TOKEN);
    expect(readSessionToken(null, HTTP)).toBeNull();
    expect(readSessionToken("tema=gelap", HTTP)).toBeNull();
  });

  it("nama cookie salah atau nilai berbentuk aneh ditolak", () => {
    // Di https, cookie bernama polos (bisa dipasang subdomain lain) tidak boleh diterima.
    expect(readSessionToken(`inovasi_session=${TOKEN}`, HTTPS)).toBeNull();
    for (const bad of ["pendek", `${TOKEN}'; drop`, "a b c".repeat(10), "x".repeat(200)]) {
      expect(readSessionToken(`inovasi_session=${bad}`, HTTP)).toBeNull();
    }
  });
});
