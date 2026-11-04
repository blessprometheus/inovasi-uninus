import Link from "next/link";

const ITEMS = [
  { href: "/admin", label: "Antrean verifikasi", key: "antrean" },
  { href: "/admin/taksonomi", label: "Data acuan", key: "taksonomi" },
] as const;

/** Navigasi bagian admin. Menu baru hanya ditambahkan bersama halamannya. */
export function AdminNav({ current }: { current: (typeof ITEMS)[number]["key"] }) {
  return (
    <nav aria-label="Menu admin" className="border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-1">
        {ITEMS.map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border-input hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
