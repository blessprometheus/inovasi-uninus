"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { apiRequest } from "./api-client";

export interface Person {
  id: string;
  name: string;
}

interface Option {
  id: string;
  fullName: string;
  facultyName: string | null;
}

/**
 * Cari peneliti (profil publik) lalu tambahkan. Satu pilihan (ketua) atau banyak (anggota).
 * Bukan combobox ARIA penuh: hasil berupa daftar tombol biasa yang bisa dijangkau dengan keyboard.
 */
export function ResearcherPicker({
  label,
  selected,
  onChange,
  multiple,
  excludeIds = [],
  hint,
  error,
  inputId,
}: {
  label: string;
  selected: Person[];
  onChange: (next: Person[]) => void;
  multiple: boolean;
  excludeIds?: string[];
  hint?: string;
  error?: string;
  inputId: string;
}) {
  const uid = useId();
  const [query, setQuery] = useState("");
  // Hasil disimpan bersama kata kuncinya. Status "memuat" diturunkan dari perbedaan kata kunci,
  // jadi effect tidak perlu mengubah state secara sinkron.
  const [result, setResult] = useState<{ term: string; options: Option[]; failed: boolean } | null>(null);
  const term = query.trim();
  const active = term.length >= 2;
  const fresh = active && result?.term === term ? result : null;
  const loading = active && !fresh;
  const options = fresh?.options ?? [];
  const failed = fresh?.failed ?? false;

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const response = await apiRequest<Option[]>("GET", `/api/v1/me/researchers?q=${encodeURIComponent(term)}`);
      if (!cancelled) setResult({ term, options: response.ok ? response.data : [], failed: !response.ok });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  const taken = new Set([...selected.map((s) => s.id), ...excludeIds]);
  const visible = options.filter((o) => !taken.has(o.id));

  function pick(option: Option) {
    const person = { id: option.id, name: option.fullName };
    onChange(multiple ? [...selected, person] : [person]);
    setQuery("");
    setResult(null);
  }

  const describedBy = [hint ? `${uid}-hint` : null, error ? `${uid}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-semibold">
        {label}
      </label>

      {selected.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${label} terpilih`}>
          {selected.map((p) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-1 rounded-control border border-border-input bg-primary-tint py-1 pl-3 pr-1 text-sm font-medium"
            >
              {p.name}
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s.id !== p.id))}
                aria-label={`Hapus ${p.name}`}
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-control hover:bg-surface"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-3 size-5 text-muted-foreground" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ketik minimal 2 huruf nama peneliti"
          autoComplete="off"
          maxLength={100}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`h-11 w-full rounded-control border bg-surface pl-10 pr-4 text-base ${error ? "border-destructive" : "border-border-input"}`}
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {loading ? "Mencari…" : active ? `${visible.length} hasil` : ""}
      </p>

      {visible.length > 0 ? (
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-control border border-border bg-surface">
          {visible.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => pick(o)}
                className="flex min-h-11 w-full cursor-pointer flex-col items-start px-4 py-2 text-left hover:bg-primary-tint"
              >
                <span className="font-semibold">{o.fullName}</span>
                {o.facultyName ? <span className="text-sm text-muted-foreground">{o.facultyName}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {fresh && !failed && options.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Tidak ada peneliti yang cocok. Hanya peneliti dengan profil publik yang dapat dicari.
        </p>
      ) : null}
      {failed ? (
        <p className="mt-2 text-sm font-medium text-destructive">Pencarian gagal. Coba lagi sebentar lagi.</p>
      ) : null}

      {hint ? (
        <p id={`${uid}-hint`} className="mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${uid}-error`} className="mt-1 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
