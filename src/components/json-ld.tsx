import { serializeJsonLd } from "@/modules/seo/json-ld";

/**
 * Data terstruktur schema.org. Satu-satunya tempat `dangerouslySetInnerHTML` dipakai, dan hanya untuk JSON
 * yang sudah di-escape oleh serializeJsonLd (teks pengguna tidak bisa menutup tag skrip). Isinya JSON,
 * bukan HTML, dan tidak pernah memuat konten pengguna mentah.
 */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
