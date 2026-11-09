"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiRequest } from "@/components/api-client";
import { Field, TextInput } from "@/components/form-fields";
import { PASSWORD_MIN_LENGTH, checkPasswordPolicy } from "@/modules/auth/password-policy";

export function PasswordForm({
  csrf,
  email,
  next,
  forced,
}: {
  csrf: string;
  email: string;
  next: string;
  forced: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [fresh, setFresh] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  // Petunjuk langsung saat mengetik; server tetap memeriksa ulang.
  const policyProblem = fresh ? checkPasswordPolicy(fresh, { email }) : null;
  const mismatch = again !== "" && again !== fresh ? "Konfirmasi tidak sama dengan kata sandi baru." : null;
  const ready = current !== "" && fresh !== "" && !policyProblem && again === fresh;

  async function submit() {
    setBusy(true);
    setErrors({});
    const result = await apiRequest("POST", "/api/v1/auth/password", {
      csrf,
      body: { currentPassword: current, newPassword: fresh },
    });
    setBusy(false);
    if (!result.ok) {
      const next: Record<string, string> = {};
      for (const d of result.details) next[d.field] ??= d.message;
      if (!Object.keys(next).length) next.form = result.message;
      setErrors(next);
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    setDone(true);
    setCurrent("");
    setFresh("");
    setAgain("");
    router.replace(forced ? next : "/admin");
    router.refresh();
  }

  if (done) {
    return (
      <p role="status" className="mt-6 rounded-control bg-primary-tint p-4 font-medium">
        Kata sandi berhasil diganti.
      </p>
    );
  }

  const summary = errors.form ?? errors.currentPassword ?? errors.newPassword;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-6 space-y-5"
    >
      {summary ? (
        <div ref={alertRef} tabIndex={-1} role="alert" className="rounded-control border border-destructive bg-surface p-3 text-sm font-medium text-destructive">
          {summary}
        </div>
      ) : null}
      {/* Pengelola kata sandi di browser memakai ini untuk menyimpan pembaruan pada akun yang benar. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field path="current" label="Kata sandi saat ini" required error={errors.currentPassword}>
        {(p) => (
          <TextInput {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} maxLength={1024} error={errors.currentPassword} />
        )}
      </Field>
      <Field
        path="new"
        label="Kata sandi baru"
        required
        error={policyProblem ?? errors.newPassword}
        hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter. Kalimat panjang yang mudah Anda ingat lebih kuat daripada kata pendek yang rumit.`}
      >
        {(p) => (
          <TextInput {...p} type="password" autoComplete="new-password" value={fresh} onChange={(e) => setFresh(e.target.value)} maxLength={128} error={policyProblem ?? errors.newPassword} />
        )}
      </Field>
      <Field path="again" label="Ulangi kata sandi baru" required error={mismatch ?? undefined}>
        {(p) => (
          <TextInput {...p} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} maxLength={128} error={mismatch ?? undefined} />
        )}
      </Field>
      <button
        type="submit"
        disabled={busy || !ready}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Menyimpan…" : "Simpan kata sandi baru"}
      </button>
    </form>
  );
}
