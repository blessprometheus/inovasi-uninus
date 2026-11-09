"use client";

import { Copy, KeyRound, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/components/api-client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, SelectInput, TextInput } from "@/components/form-fields";
import { formatDateTime } from "@/platform/format/date";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  roles: string[];
  isActive: boolean;
  hasPassword: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  operator: "Operator",
  researcher: "Dosen (nonaktif)",
};

const BTN =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** Kata sandi sementara ditampilkan sekali, supaya super admin menyampaikannya ke pemilik akun. */
function TemporaryPassword({ who, password, onClose }: { who: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-card border border-accent bg-surface p-5">
      <p className="font-semibold">Kata sandi sementara untuk {who}</p>
      <p className="mt-2 flex flex-wrap items-center gap-3">
        <code className="rounded-control bg-background px-3 py-2 text-lg font-bold tracking-wider">{password}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(password).catch(() => undefined);
            setCopied(true);
          }}
          className={`${BTN} border border-border-input hover:bg-primary-tint`}
        >
          <Copy className="size-4" aria-hidden="true" />
          {copied ? "Tersalin" : "Salin"}
        </button>
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Ini hanya tampil sekali dan tidak disimpan di mana pun. Sampaikan lewat jalur yang aman (bukan grup obrolan
        terbuka). Pemilik akun wajib menggantinya saat masuk pertama kali.
      </p>
      <button type="button" onClick={onClose} className={`${BTN} mt-3 bg-primary text-on-primary hover:bg-primary-hover`}>
        Sudah saya catat
      </button>
    </div>
  );
}

export function UsersManager({ csrf, currentUserId, users }: { csrf: string; currentUserId: string; users: UserRow[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"operator" | "super_admin">("operator");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ who: string; password: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);

  async function create() {
    setBusy(true);
    setErrors({});
    const result = await apiRequest<{ temporaryPassword: string; user: UserRow }>("POST", "/api/v1/admin/users", {
      csrf,
      body: { email, name, role },
    });
    setBusy(false);
    if (!result.ok) {
      const next: Record<string, string> = {};
      for (const d of result.details) next[d.field] ??= d.message;
      if (!Object.keys(next).length) next.form = result.message;
      setErrors(next);
      return;
    }
    setReveal({ who: result.data.user.email, password: result.data.temporaryPassword });
    setEmail("");
    setName("");
    router.refresh();
  }

  async function patch(user: UserRow, body: { isActive?: boolean; role?: "operator" | "super_admin" }) {
    setBusy(true);
    setRowError(null);
    const result = await apiRequest("PATCH", `/api/v1/admin/users/${user.id}`, { csrf, body });
    setBusy(false);
    if (!result.ok) return setRowError(`${user.email}: ${result.details[0]?.message ?? result.message}`);
    router.refresh();
  }

  async function reset() {
    if (!resetTarget) return;
    setBusy(true);
    setRowError(null);
    const result = await apiRequest<{ temporaryPassword: string }>("POST", `/api/v1/admin/users/${resetTarget.id}/reset-password`, { csrf });
    setBusy(false);
    if (!result.ok) {
      setRowError(`${resetTarget.email}: ${result.details[0]?.message ?? result.message}`);
      setResetTarget(null);
      return;
    }
    setReveal({ who: resetTarget.email, password: result.data.temporaryPassword });
    setResetTarget(null);
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-10">
      {reveal ? <TemporaryPassword who={reveal.who} password={reveal.password} onClose={() => setReveal(null)} /> : null}

      <section aria-labelledby="akun-baru" className="rounded-card border border-border bg-surface p-5 sm:p-6">
        <h2 id="akun-baru" className="text-xl font-semibold">
          Tambah akun
        </h2>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          {errors.form ? (
            <p role="alert" className="sm:col-span-2 text-sm font-medium text-destructive">
              {errors.form}
            </p>
          ) : null}
          <Field path="user-email" label="Email" required error={errors.email}>
            {(p) => <TextInput {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} error={errors.email} />}
          </Field>
          <Field path="user-name" label="Nama" required error={errors.name}>
            {(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} error={errors.name} />}
          </Field>
          <Field path="user-role" label="Peran" error={errors.role} hint="Operator menginput dan menerbitkan konten. Super admin juga mengelola akun.">
            {(p) => (
              <SelectInput {...p} value={role} onChange={(e) => setRole(e.target.value as "operator" | "super_admin")}>
                <option value="operator">Operator</option>
                <option value="super_admin">Super admin</option>
              </SelectInput>
            )}
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={busy || !email || !name} className={`${BTN} min-h-11 w-full bg-primary px-5 text-on-primary hover:bg-primary-hover`}>
              <UserPlus className="size-5" aria-hidden="true" />
              Buat akun
            </button>
          </div>
        </form>
        <p className="mt-3 text-sm text-muted-foreground">
          Sistem membuat kata sandi sementara dan menampilkannya sekali. Belum ada pengiriman email.
        </p>
      </section>

      <section aria-labelledby="daftar-akun">
        <h2 id="daftar-akun" className="text-xl font-semibold">
          Akun ({users.length})
        </h2>
        {rowError ? (
          <p role="alert" className="mt-3 rounded-control border border-destructive bg-surface p-3 text-sm font-medium text-destructive">
            {rowError}
          </p>
        ) : null}
        <ul className="mt-4 space-y-3">
          {users.map((u) => {
            const self = u.id === currentUserId;
            const managed = u.roles.find((r) => r === "super_admin" || r === "operator") ?? "operator";
            const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
            return (
              <li key={u.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {u.name}
                      {self ? <span className="ml-2 text-sm font-medium text-muted-foreground">(Anda)</span> : null}
                    </p>
                    <p className="break-all text-sm text-muted-foreground">{u.email}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {u.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "Tanpa peran"} ·{" "}
                      {u.isActive ? "Aktif" : "Nonaktif"}
                      {!u.hasPassword ? " · Tanpa kata sandi (tidak bisa masuk lewat formulir)" : ""}
                      {u.mustChangePassword ? " · Belum mengganti kata sandi sementara" : ""}
                      {locked ? " · Terkunci sementara" : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Terakhir masuk: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "belum pernah"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`peran-${u.id}`}>
                      Peran {u.email}
                    </label>
                    <select
                      id={`peran-${u.id}`}
                      value={managed}
                      disabled={busy || self}
                      onChange={(e) => void patch(u, { role: e.target.value as "operator" | "super_admin" })}
                      className="h-11 rounded-control border border-border-input bg-surface px-3 text-sm disabled:opacity-60"
                    >
                      <option value="operator">Operator</option>
                      <option value="super_admin">Super admin</option>
                    </select>
                    <button type="button" disabled={busy || self} onClick={() => setResetTarget(u)} className={`${BTN} border border-border-input hover:bg-primary-tint`}>
                      <KeyRound className="size-4" aria-hidden="true" />
                      Atur ulang sandi<span className="sr-only">: {u.email}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || self}
                      onClick={() => void patch(u, { isActive: !u.isActive })}
                      className={`${BTN} border ${u.isActive ? "border-destructive text-destructive" : "border-primary text-primary"} hover:bg-background`}
                    >
                      {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                      <span className="sr-only">: {u.email}</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <ConfirmDialog
        open={resetTarget !== null}
        title="Atur ulang kata sandi?"
        description={`Kata sandi lama ${resetTarget?.email ?? ""} langsung tidak berlaku, semua perangkatnya keluar, dan Anda mendapat kata sandi sementara yang wajib diganti saat masuk.`}
        confirmLabel="Atur ulang"
        busy={busy}
        onConfirm={reset}
        onCancel={() => !busy && setResetTarget(null)}
      />
    </div>
  );
}
