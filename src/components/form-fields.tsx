"use client";

import type { ReactNode } from "react";

/** Id elemen untuk sebuah field, dipakai label, pesan galat, dan tautan ringkasan galat. */
export function fieldId(path: string): string {
  return `f-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

const INPUT =
  "w-full rounded-control border bg-surface px-4 text-base placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-background";

function borderFor(error?: string) {
  return error ? "border-destructive" : "border-border-input";
}

/** Label selalu terlihat; bantuan di bawah; galat dekat field dan terhubung lewat aria-describedby. */
export function Field({
  path,
  label,
  required,
  hint,
  error,
  children,
}: {
  path: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const id = fieldId(path);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-destructive">
              {" "}
              *
            </span>
            <span className="sr-only"> (wajib)</span>
          </>
        ) : null}
      </label>
      <div className="mt-1">
        {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true as const } : {}) })}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  error,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return <input {...props} className={`${INPUT} h-11 ${borderFor(error)} ${className}`} />;
}

export function SelectInput({
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <select {...props} className={`${INPUT} h-11 ${borderFor(error)}`}>
      {children}
    </select>
  );
}

/** Textarea dengan penghitung karakter yang diumumkan secara sopan ke pembaca layar. */
export function TextArea({
  error,
  value,
  maxLength,
  rows = 5,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & { error?: string; value: string; maxLength: number }) {
  return (
    <div>
      <textarea
        {...props}
        value={value}
        maxLength={maxLength}
        rows={rows}
        className={`${INPUT} py-2 leading-relaxed ${borderFor(error)}`}
      />
      <p className="mt-1 text-right text-xs text-muted-foreground" aria-hidden="true">
        {value.length} / {maxLength}
      </p>
    </div>
  );
}
