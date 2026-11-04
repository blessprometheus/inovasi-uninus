"use client";

import { useState } from "react";
import { apiRequest } from "@/components/api-client";

const ROLES = [
  { value: "researcher", label: "Dosen / Peneliti" },
  { value: "operator", label: "Operator" },
  { value: "super_admin", label: "Super Administrator" },
] as const;

/** Hanya dirender saat DEV_LOGIN aktif (lihat halaman). Server tetap menolak bila mode dev mati. */
export function DevLoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("researcher");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest("POST", "/api/v1/auth/dev-login", { body: { email: email.trim(), role } });
    if (!result.ok) {
      setError(result.details[0]?.message ?? result.message);
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
      {error ? (
        <p role="alert" className="rounded-control border border-destructive bg-surface px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-semibold">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@uninus.ac.id"
          className="mt-1 h-11 w-full rounded-control border border-border-input bg-surface px-4 text-base"
        />
        <p className="mt-1 text-sm text-muted-foreground">Akun uji dibuat otomatis pada login pertama.</p>
      </div>

      <div>
        <label htmlFor="role" className="block text-sm font-semibold">
          Masuk sebagai
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="mt-1 h-11 w-full rounded-control border border-border-input bg-surface px-3 text-base"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Memproses…" : "Masuk"}
      </button>
    </form>
  );
}
