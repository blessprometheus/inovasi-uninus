import type { CatalogDetail } from "@/modules/catalog/types";
import type { ResearcherDetail } from "@/modules/researchers/types";

const SITE_NAME = "Inovasi UNINUS";
const ORG_NAME = "Universitas Islam Nusantara";
const LOGO_PATH = "/brand/logo-uninus.png";

type JsonLd = Record<string, unknown>;

// Dua karakter ini sah di JSON tetapi memutus string literal JavaScript pada mesin lama.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * Serialisasi aman untuk disisipkan di dalam `<script type="application/ld+json">`. Data berasal dari
 * pengguna (judul, nama), jadi karakter yang bisa menutup tag atau memecah skrip di-escape.
 * Hasilnya tetap JSON yang valid dengan makna yang sama.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LINE_SEPARATOR).join("\\u2028")
    .split(PARAGRAPH_SEPARATOR).join("\\u2029");
}

/** Membuang nilai kosong (null, undefined, string kosong, array kosong) agar JSON-LD tidak berisi noise. */
function compact<T extends JsonLd>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  ) as T;
}

const org = (baseUrl: string): JsonLd => ({
  "@type": "CollegeOrUniversity",
  name: ORG_NAME,
  logo: `${baseUrl}${LOGO_PATH}`,
});

/** Beranda: identitas situs dan organisasi, plus kotak pencarian katalog. */
export function websiteJsonLd(baseUrl: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...org(baseUrl), "@id": `${baseUrl}/#organization`, url: baseUrl },
      {
        "@type": "WebSite",
        "@id": `${baseUrl}/#website`,
        url: baseUrl,
        name: SITE_NAME,
        inLanguage: "id-ID",
        publisher: { "@id": `${baseUrl}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${baseUrl}/inovasi?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export function breadcrumbJsonLd(baseUrl: string, items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${baseUrl}${item.path}`,
    })),
  };
}

/** Halaman detail inovasi. Hanya data yang memang tampil di halaman; tanpa NIDN/NIP. */
export function innovationJsonLd(item: CatalogDetail, baseUrl: string): JsonLd {
  const url = `${baseUrl}/inovasi/${item.slug}`;
  const authors = [...item.members].sort((a, b) => Number(b.role === "lead") - Number(a.role === "lead"));
  return compact({
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${url}#inovasi`,
    url,
    name: item.title,
    headline: item.title,
    description: item.summary,
    abstract: item.abstract,
    inLanguage: "id-ID",
    datePublished: item.publishedAt,
    genre: item.typeName,
    keywords: item.categoryName,
    isAccessibleForFree: true,
    author: authors.map((m) => ({ "@type": "Person", name: m.name })),
    publisher: org(baseUrl),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: baseUrl },
  });
}

/** Profil peneliti publik. Tautan eksternal sudah dibatasi http/https di sumber data. */
export function researcherJsonLd(r: ResearcherDetail, baseUrl: string): JsonLd {
  const url = `${baseUrl}/peneliti/${r.slug}`;
  return compact({
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${url}#peneliti`,
    url,
    name: r.fullName,
    jobTitle: r.position,
    description: r.bio,
    affiliation: compact({ ...org(baseUrl), department: r.facultyName ? { "@type": "Organization", name: r.facultyName } : null }),
    sameAs: r.externalLinks.map((l) => l.url),
  });
}
