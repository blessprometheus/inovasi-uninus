import { describe, expect, it } from "vitest";
import {
  createCsrfToken,
  isAllowedOrigin,
  isStateChangingMethod,
  verifyCsrfToken,
} from "./csrf";
import {
  DEFAULT_SESSION_LIFETIME,
  generateSessionToken,
  hashSessionToken,
  isSessionValid,
  newSessionExpiry,
  slideIdleExpiry,
} from "./session-token";

describe("token sesi", () => {
  it("acak, panjang memadai, dan aman untuk cookie", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hash deterministik, berbeda dari token, dan 64 heksadesimal", () => {
    const t = generateSessionToken();
    expect(hashSessionToken(t)).toBe(hashSessionToken(t));
    expect(hashSessionToken(t)).not.toBe(t);
    expect(hashSessionToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(t)).not.toBe(hashSessionToken(generateSessionToken()));
  });
});

describe("masa berlaku sesi", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("sesi baru valid, dengan idle 60 menit dan absolut 8 jam", () => {
    const e = newSessionExpiry(now);
    expect(e.idleExpiresAt.getTime() - now.getTime()).toBe(DEFAULT_SESSION_LIFETIME.idleMs);
    expect(e.expiresAt.getTime() - now.getTime()).toBe(DEFAULT_SESSION_LIFETIME.absoluteMs);
    expect(isSessionValid(e, now)).toBe(true);
  });

  it("kedaluwarsa karena idle atau karena batas absolut", () => {
    const e = newSessionExpiry(now);
    const afterIdle = new Date(now.getTime() + DEFAULT_SESSION_LIFETIME.idleMs + 1);
    expect(isSessionValid(e, afterIdle)).toBe(false);
    const afterAbsolute = new Date(now.getTime() + DEFAULT_SESSION_LIFETIME.absoluteMs + 1);
    expect(isSessionValid({ expiresAt: e.expiresAt, idleExpiresAt: new Date(2100, 0) }, afterAbsolute)).toBe(false);
  });

  it("perpanjangan idle tidak pernah melewati batas absolut", () => {
    const e = newSessionExpiry(now);
    const nearEnd = new Date(now.getTime() + DEFAULT_SESSION_LIFETIME.absoluteMs - 1000);
    expect(slideIdleExpiry(e, nearEnd).getTime()).toBe(e.expiresAt.getTime());
    const early = new Date(now.getTime() + 1000);
    expect(slideIdleExpiry(e, early).getTime()).toBe(early.getTime() + DEFAULT_SESSION_LIFETIME.idleMs);
  });
});

describe("CSRF", () => {
  const secret = "rahasia-uji-yang-panjang";

  it("metode pengubah data dikenali", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) expect(isStateChangingMethod(m)).toBe(true);
    for (const m of ["GET", "HEAD", "OPTIONS"]) expect(isStateChangingMethod(m)).toBe(false);
  });

  it("Origin harus sama persis dengan origin aplikasi", () => {
    const app = "https://inovasi.uninus.ac.id";
    expect(isAllowedOrigin("https://inovasi.uninus.ac.id", app)).toBe(true);
    expect(isAllowedOrigin(null, app)).toBe(false);
    expect(isAllowedOrigin("", app)).toBe(false);
    expect(isAllowedOrigin("https://evil.example", app)).toBe(false);
    expect(isAllowedOrigin("https://inovasi.uninus.ac.id.evil.example", app)).toBe(false);
    expect(isAllowedOrigin("http://inovasi.uninus.ac.id", app)).toBe(false);
    expect(isAllowedOrigin("bukan-url", app)).toBe(false);
  });

  it("token terikat pada sesi dan secret", () => {
    const t = createCsrfToken("sesi-1", secret);
    expect(verifyCsrfToken(t, "sesi-1", secret)).toBe(true);
    expect(verifyCsrfToken(t, "sesi-2", secret)).toBe(false);
    expect(verifyCsrfToken(t, "sesi-1", "secret-lain")).toBe(false);
  });

  it("menolak token kosong, salah, atau berbeda panjang tanpa melempar error", () => {
    expect(verifyCsrfToken(null, "sesi-1", secret)).toBe(false);
    expect(verifyCsrfToken("", "sesi-1", secret)).toBe(false);
    expect(verifyCsrfToken("pendek", "sesi-1", secret)).toBe(false);
    expect(verifyCsrfToken("x".repeat(200), "sesi-1", secret)).toBe(false);
  });
});
