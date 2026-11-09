"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiRequest } from "@/components/api-client";
import { Field, TextInput } from "@/components/form-fields";

/** Login operator dengan email + kata sandi (ADR-008). Pesan gagal sengaja umum dari server. */
export function PasswordLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await apiRequest<{ mustChangePassword: boolean }>("POST", "/api/v1/auth/login", {
      body: { email, password },
    });
    if (!result.ok) {
      setBusy(false);
      setPassword("");
      setError(result.details[0]?.message ?? result.message);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    // Akun bersandi sementara dialihkan ke halaman ganti sandi; selebihnya ke tujuan semula.
    router.replace(result.data.mustChangePassword ? `/akun/kata-sandi?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-6 space-y-5"
    >
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-control border border-destructive bg-surface p-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Field path="email" label="Email" required>
        {(p) => (
          <TextInput
            {...p}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
          />
        )}
      </Field>
      <Field path="password" label="Kata sandi" required>
        {(p) => (
          <TextInput
            {...p}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={1024}
            required
          />
        )}
      </Field>
      <button
        type="submit"
        disabled={busy || !email || !password}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Memeriksa…" : "Masuk"}
      </button>
    </form>
  );
}
