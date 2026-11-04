const ZONE = "Asia/Jakarta";

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: ZONE });
const dateTimeFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONE,
});

/** "4 November 2026" (zona WIB). Nilai tidak valid menghasilkan "-" agar tampilan tidak rusak. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : dateFormat.format(d);
}

/** "4 November 2026 pukul 10.15 (WIB)". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : `${dateTimeFormat.format(d).replace(",", "")} WIB`;
}
