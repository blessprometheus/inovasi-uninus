import { ROLES, type PermissionCode, type RoleCode } from "@/modules/auth/permissions";
import { recordAudit } from "@/platform/audit/audit";
import type { Database } from "@/platform/db/client";
import { fail, json, ok, validationFailure } from "@/platform/http/response";
import { z } from "@/platform/http/zod";
import { clearSessionCookie, readSessionToken, serializeSessionCookie } from "./cookie";
import { createCsrfToken, isAllowedOrigin, verifyCsrfToken } from "./csrf";
import { isDevLoginEnabled } from "./dev-login";
import { DevLoginError, ensureDevUser } from "./dev-login-service";
import { createLocalAuth } from "./local-auth";
import { createRateLimiter, type RateLimiter } from "@/platform/http/rate-limit";
import { createSession, findSession, revokeSession, type ActiveSession } from "./session-store";

type Env = Record<string, string | undefined>;

export interface AuthDeps {
  db: Database;
  appUrl: string;
  /** Kunci HMAC untuk token CSRF. */
  secret: string;
  env?: Env;
  /** Untuk tes: pembatas dan penguncian yang bisa diatur. */
  loginLimiters?: { global: RateLimiter; perEmail: RateLimiter };
  lockout?: { maxFailures?: number; lockMinutes?: number };
}

/** Kunci wajib ada dan cukup panjang; dihasilkan sekali per lingkungan (lihat .env.example). */
export function requireAuthSecret(env: Env = process.env): string {
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET belum diatur atau kurang dari 32 karakter (lihat .env.example).");
  }
  return secret;
}

const FORBIDDEN_ORIGIN = () => json(fail("FORBIDDEN", "Permintaan ditolak."));
const UNAUTHENTICATED = () => json(fail("UNAUTHENTICATED", "Silakan masuk terlebih dahulu."));

const loginSchema = z.strictObject({
  email: z.string().trim().min(1, "Email wajib diisi.").max(254),
  password: z.string().min(1, "Kata sandi wajib diisi.").max(1024),
});

const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, "Kata sandi saat ini wajib diisi.").max(1024),
  newPassword: z.string().min(1, "Kata sandi baru wajib diisi.").max(1024),
});

const LOGIN_FAILED = "Email atau kata sandi salah, atau akun sedang dikunci sementara.";

const devLoginSchema = z.strictObject({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(Object.keys(ROLES) as [RoleCode, ...RoleCode[]]),
});

export function createAuthHandlers(deps: AuthDeps) {
  const { db, appUrl, secret } = deps;
  const env = deps.env ?? process.env;
  const localAuth = createLocalAuth(db, deps.lockout);
  // Tiap percobaan login memakan CPU (argon2). Batas global melindungi server bersama dari banjir permintaan,
  // batas per email memperlambat tebakan sebelum penguncian akun bekerja. Per proses (satu proses, ADR-001).
  const limiters = deps.loginLimiters ?? {
    global: createRateLimiter({ limit: 60, windowMs: 60_000 }),
    perEmail: createRateLimiter({ limit: 10, windowMs: 60_000 }),
  };

  async function currentSession(request: Request): Promise<ActiveSession | null> {
    const token = readSessionToken(request.headers.get("cookie"), appUrl);
    return token ? findSession(db, token) : null;
  }

  return {
    /** Dipakai juga oleh handler lain (dashboard) untuk memuat sesi dari request. */
    currentSession,

    /**
     * Gerbang rute yang butuh login. Untuk metode pengubah data, Origin dan token CSRF wajib
     * (docs/API_DOCUMENTATION.md §2). Mengembalikan sesi, atau Response penolakan siap kirim.
     */
    async authenticate(
      request: Request,
      options: { mutation?: boolean; permission?: PermissionCode; allowPasswordChange?: boolean } = {},
    ): Promise<{ session: ActiveSession } | { response: Response }> {
      if (options.mutation && !isAllowedOrigin(request.headers.get("origin"), appUrl)) {
        return { response: FORBIDDEN_ORIGIN() };
      }
      const session = await currentSession(request);
      if (!session) return { response: UNAUTHENTICATED() };
      if (options.mutation && !verifyCsrfToken(request.headers.get("x-csrf-token"), session.sessionId, secret)) {
        return { response: json(fail("FORBIDDEN", "Token keamanan tidak valid. Muat ulang halaman.")) };
      }
      if (session.user.mustChangePassword && !options.allowPasswordChange) {
        return { response: json(fail("PASSWORD_CHANGE_REQUIRED", "Ganti kata sandi sementara Anda terlebih dahulu.")) };
      }
      if (options.permission && !session.user.permissions.has(options.permission)) {
        return { response: json(fail("FORBIDDEN", "Anda tidak berwenang mengakses ini.")) };
      }
      return { session };
    },

    async me(request: Request): Promise<Response> {
      const session = await currentSession(request);
      if (!session) return UNAUTHENTICATED();
      const { user } = session;
      return json(
        ok({
          id: user.id,
          email: user.email,
          name: user.name,
          mustChangePassword: user.mustChangePassword,
          roles: user.roles,
          permissions: [...user.permissions].sort(),
        }),
      );
    },

    async csrf(request: Request): Promise<Response> {
      const session = await currentSession(request);
      if (!session) return UNAUTHENTICATED();
      return json(ok({ token: createCsrfToken(session.sessionId, secret) }));
    },

    /** Login email + kata sandi (ADR-008). Semua kegagalan memberi jawaban yang sama. */
    async login(request: Request): Promise<Response> {
      if (!isAllowedOrigin(request.headers.get("origin"), appUrl)) return FORBIDDEN_ORIGIN();

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json(fail("VALIDATION_ERROR", "Isi permintaan bukan JSON yang valid."));
      }
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) return json(validationFailure(parsed.error));

      const email = parsed.data.email.toLowerCase();
      if (!limiters.global.allow("global") || !limiters.perEmail.allow(email)) {
        return json(fail("RATE_LIMITED", "Terlalu banyak percobaan masuk. Coba lagi sebentar lagi."));
      }

      try {
        const userAgent = request.headers.get("user-agent");
        const result = await localAuth.login({ email, password: parsed.data.password }, { userAgent });
        if (!result.ok) return json(fail("UNAUTHENTICATED", LOGIN_FAILED));

        // Rotasi: sesi lama (bila ada) dicabut supaya token sebelum login tidak ikut berlaku.
        const previous = await currentSession(request);
        if (previous) await revokeSession(db, previous.sessionId);

        const { token, expiresAt } = await createSession(db, result.user.id, { userAgent });
        await recordAudit(db, {
          actorId: result.user.id,
          action: "auth.login",
          entityType: "user",
          entityId: result.user.id,
          changes: { method: "password" },
          userAgent,
        });
        const response = json(ok({ id: result.user.id, name: result.user.name, mustChangePassword: result.user.mustChangePassword }));
        response.headers.append(
          "Set-Cookie",
          serializeSessionCookie(token, appUrl, (expiresAt.getTime() - Date.now()) / 1000),
        );
        return response;
      } catch (error) {
        console.error("login gagal", error);
        return json(fail("INTERNAL_ERROR", "Terjadi kesalahan pada server."));
      }
    },

    /** Mengganti kata sandi sendiri. Satu-satunya aksi yang boleh dilakukan akun berkata sandi sementara. */
    async changePassword(request: Request): Promise<Response> {
      const g = await this.authenticate(request, { mutation: true, allowPasswordChange: true });
      if ("response" in g) return g.response;
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json(fail("VALIDATION_ERROR", "Isi permintaan bukan JSON yang valid."));
      }
      const parsed = changePasswordSchema.safeParse(body);
      if (!parsed.success) return json(validationFailure(parsed.error));

      const result = await localAuth.changePassword(g.session.user.id, g.session.sessionId, parsed.data, {
        userAgent: request.headers.get("user-agent"),
      });
      if (result.ok) return json(ok({ changed: true }));
      const field = result.code === "WRONG_CURRENT" || result.code === "LOCKED" ? "currentPassword" : "newPassword";
      return json(fail("VALIDATION_ERROR", result.message, [{ field, message: result.message }]));
    },

    /** Idempoten: keluar tanpa sesi tetap berhasil dan membersihkan cookie. */
    async logout(request: Request): Promise<Response> {
      if (!isAllowedOrigin(request.headers.get("origin"), appUrl)) return FORBIDDEN_ORIGIN();

      const session = await currentSession(request);
      if (session) {
        if (!verifyCsrfToken(request.headers.get("x-csrf-token"), session.sessionId, secret)) {
          return json(fail("FORBIDDEN", "Token keamanan tidak valid. Muat ulang halaman."));
        }
        await revokeSession(db, session.sessionId);
        await recordAudit(db, {
          actorId: session.user.id,
          action: "auth.logout",
          entityType: "session",
          entityId: session.sessionId,
          userAgent: request.headers.get("user-agent"),
        });
      }
      const response = json(ok({ loggedOut: true }));
      response.headers.append("Set-Cookie", clearSessionCookie(appUrl));
      return response;
    },

    /** Hanya ada di pengembangan (DEV_LOGIN=1). Di luar itu berpura-pura rute tidak ada. */
    async devLogin(request: Request): Promise<Response> {
      if (!isDevLoginEnabled(env)) return json(fail("NOT_FOUND", "Data tidak ditemukan."));
      if (!isAllowedOrigin(request.headers.get("origin"), appUrl)) return FORBIDDEN_ORIGIN();

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json(fail("VALIDATION_ERROR", "Isi permintaan bukan JSON yang valid."));
      }
      const parsed = devLoginSchema.safeParse(body);
      if (!parsed.success) return json(validationFailure(parsed.error));

      try {
        const { email, role } = parsed.data;
        const name = parsed.data.name ?? `[DUMMY] ${email.split("@")[0]}`;
        const user = await ensureDevUser(db, { email, name, role });

        // Rotasi: sesi lama (bila ada) dicabut supaya token sebelum login tidak ikut berlaku.
        const previous = await currentSession(request);
        if (previous) await revokeSession(db, previous.sessionId);

        const userAgent = request.headers.get("user-agent");
        const { token, expiresAt } = await createSession(db, user.id, { userAgent });
        await recordAudit(db, {
          actorId: user.id,
          action: "auth.login",
          entityType: "user",
          entityId: user.id,
          changes: { method: "dev", role },
          userAgent,
        });

        const response = json(ok({ id: user.id, email, name, role }));
        response.headers.append(
          "Set-Cookie",
          serializeSessionCookie(token, appUrl, (expiresAt.getTime() - Date.now()) / 1000),
        );
        return response;
      } catch (error) {
        if (error instanceof DevLoginError) return json(fail("INTERNAL_ERROR", error.message));
        console.error("dev-login gagal", error);
        return json(fail("INTERNAL_ERROR", "Terjadi kesalahan pada server."));
      }
    },
  };
}

export type AuthHandlers = ReturnType<typeof createAuthHandlers>;
