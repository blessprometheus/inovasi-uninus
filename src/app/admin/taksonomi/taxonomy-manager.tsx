"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/components/api-client";
import { Field, SelectInput, TextInput } from "@/components/form-fields";

export type Kind = "faculties" | "study-programs" | "categories" | "innovation-types";

export interface Item {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  facultyId?: string;
  description?: string | null;
  sortOrder?: number;
  innovationCount: number;
}

const SINGULAR: Record<Kind, string> = {
  faculties: "fakultas",
  "study-programs": "program studi",
  categories: "kategori",
  "innovation-types": "jenis inovasi",
};

const BTN =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** Tambah, ubah nama, dan (non)aktifkan. Tanpa hapus: item yang dipakai inovasi tidak boleh hilang. */
export function TaxonomyManager({
  kind,
  items,
  faculties,
  csrf,
}: {
  kind: Kind;
  items: Item[];
  faculties: { id: string; name: string }[];
  csrf: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState({ name: "", description: "", sortOrder: "", facultyId: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", description: "", sortOrder: "" });

  const hasSort = kind === "categories" || kind === "innovation-types";
  const facultyName = (id?: string) => faculties.find((f) => f.id === id)?.name;
  const label = SINGULAR[kind];

  async function call(method: "POST" | "PATCH", path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const result = await apiRequest(method, path, { csrf, body });
    setBusy(false);
    if (!result.ok) {
      setError(result.details[0]?.message ?? result.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const sort = Number.parseInt(created.sortOrder, 10);
    const body: Record<string, unknown> = { name: created.name };
    if (kind === "study-programs") body.facultyId = created.facultyId;
    if (kind === "categories" && created.description.trim()) body.description = created.description;
    if (hasSort && Number.isFinite(sort)) body.sortOrder = sort;
    if (await call("POST", `/api/v1/admin/${kind}`, body)) {
      setCreated({ name: "", description: "", sortOrder: "", facultyId: "" });
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEdit({ name: item.name, description: item.description ?? "", sortOrder: item.sortOrder?.toString() ?? "" });
    setError(null);
  }

  async function saveEdit(item: Item) {
    const sort = Number.parseInt(edit.sortOrder, 10);
    const body: Record<string, unknown> = { name: edit.name };
    if (kind === "categories") body.description = edit.description.trim() === "" ? null : edit.description;
    if (hasSort && Number.isFinite(sort)) body.sortOrder = sort;
    if (await call("PATCH", `/api/v1/admin/${kind}/${item.id}`, body)) setEditingId(null);
  }

  return (
    <div className="mt-6">
      <form onSubmit={create} className="rounded-card border border-border bg-surface p-5" noValidate>
        <h2 className="text-lg font-semibold">Tambah {label}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {kind === "study-programs" ? (
            <Field path="new-faculty" label="Fakultas" required>
              {(p) => (
                <SelectInput {...p} value={created.facultyId} onChange={(x) => setCreated({ ...created, facultyId: x.target.value })}>
                  <option value="">Pilih fakultas</option>
                  {faculties.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
          ) : null}
          <Field path="new-name" label={`Nama ${label}`} required>
            {(p) => (
              <TextInput {...p} value={created.name} maxLength={150} onChange={(x) => setCreated({ ...created, name: x.target.value })} />
            )}
          </Field>
          {kind === "categories" ? (
            <Field path="new-desc" label="Deskripsi" hint="Opsional.">
              {(p) => (
                <TextInput {...p} value={created.description} maxLength={500} onChange={(x) => setCreated({ ...created, description: x.target.value })} />
              )}
            </Field>
          ) : null}
          {hasSort ? (
            <Field path="new-sort" label="Urutan" hint="Angka kecil tampil lebih dulu. Opsional.">
              {(p) => (
                <TextInput {...p} type="number" min={0} max={10000} value={created.sortOrder} onChange={(x) => setCreated({ ...created, sortOrder: x.target.value })} />
              )}
            </Field>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={busy || created.name.trim().length < 2 || (kind === "study-programs" && !created.facultyId)}
          className={`${BTN} mt-5 border-primary bg-primary text-on-primary hover:bg-primary-hover`}
        >
          <Plus className="size-5" aria-hidden="true" />
          Tambah
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-control border border-destructive bg-surface px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-border-input bg-surface p-6 text-center text-muted-foreground">
          Belum ada {label}. Tambahkan yang pertama di atas.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {items.map((item) => (
            <li key={item.id} className="p-4">
              {editingId === item.id ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field path={`edit-name-${item.id}`} label="Nama" required>
                      {(p) => <TextInput {...p} value={edit.name} maxLength={150} onChange={(x) => setEdit({ ...edit, name: x.target.value })} />}
                    </Field>
                    {kind === "categories" ? (
                      <Field path={`edit-desc-${item.id}`} label="Deskripsi">
                        {(p) => <TextInput {...p} value={edit.description} maxLength={500} onChange={(x) => setEdit({ ...edit, description: x.target.value })} />}
                      </Field>
                    ) : null}
                    {hasSort ? (
                      <Field path={`edit-sort-${item.id}`} label="Urutan">
                        {(p) => <TextInput {...p} type="number" min={0} max={10000} value={edit.sortOrder} onChange={(x) => setEdit({ ...edit, sortOrder: x.target.value })} />}
                      </Field>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" disabled={busy || edit.name.trim().length < 2} onClick={() => saveEdit(item)} className={`${BTN} border-primary bg-primary text-on-primary hover:bg-primary-hover`}>
                      Simpan
                    </button>
                    <button type="button" disabled={busy} onClick={() => setEditingId(null)} className={`${BTN} border-border-input hover:bg-primary-tint`}>
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        facultyName(item.facultyId),
                        item.description,
                        `${item.innovationCount} inovasi terbit`,
                        hasSort ? `urutan ${item.sortOrder ?? 0}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-control px-2.5 py-1 text-sm font-semibold ${
                      item.isActive ? "bg-status-approved-bg text-status-approved-fg" : "border border-dashed border-border-input text-muted-foreground"
                    }`}
                  >
                    {item.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => startEdit(item)} className={`${BTN} border-border-input hover:bg-primary-tint`}>
                      <Pencil className="size-4" aria-hidden="true" />
                      Ubah<span className="sr-only"> {item.name}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => call("PATCH", `/api/v1/admin/${kind}/${item.id}`, { isActive: !item.isActive })}
                      className={`${BTN} border-border-input hover:bg-primary-tint`}
                    >
                      {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                      <span className="sr-only"> {item.name}</span>
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        Item tidak dapat dihapus karena bisa dipakai inovasi. Nonaktifkan agar tidak muncul sebagai pilihan baru; inovasi
        lama tetap menyimpannya.
      </p>
    </div>
  );
}
