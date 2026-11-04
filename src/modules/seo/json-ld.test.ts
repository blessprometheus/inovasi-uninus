import { describe, expect, it } from "vitest";
import type { CatalogDetail } from "@/modules/catalog/types";
import type { ResearcherDetail } from "@/modules/researchers/types";
import { breadcrumbJsonLd, innovationJsonLd, researcherJsonLd, serializeJsonLd, websiteJsonLd } from "./json-ld";

const BASE = "https://inovasi.uninus.ac.id";

const detail = (over: Partial<CatalogDetail> = {}): CatalogDetail => ({
  slug: "pengering-padi",
  title: "[DUMMY] Pengering Padi",
  summary: "[DUMMY] Ringkasan",
  categoryName: "[DUMMY] Pangan",
  leadResearcherName: "[DUMMY] Ketua",
  facultyName: "[DUMMY] Fakultas",
  year: 2024,
  hasIp: false,
  coverUrl: null,
  coverAlt: null,
  typeName: null,
  studyProgramName: null,
  abstract: null,
  background: null,
  problemStatement: null,
  objective: null,
  methodology: null,
  description: null,
  advantages: null,
  benefits: null,
  developmentPotential: null,
  members: [
    { name: "[DUMMY] Anggota", role: "member" },
    { name: "[DUMMY] Ketua", role: "lead" },
  ],
  publications: [],
  intellectualProperties: [],
  publishedAt: "2025-01-01T00:00:00.000Z",
  ...over,
});

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe("serializeJsonLd", () => {
  it("meng-escape karakter yang bisa menutup tag skrip, tetapi tetap JSON yang sama maknanya", () => {
    const evil = { name: "</script><script>alert(1)</script>", note: "a & b <b>", sep: `x${LS}y${PS}z` };
    const out = serializeJsonLd(evil);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out.toLowerCase()).not.toContain("</script");
    expect(JSON.parse(out)).toEqual(evil);
  });
});

describe("innovationJsonLd", () => {
  it("memuat data yang tampil di halaman, ketua lebih dulu, URL absolut", () => {
    const ld = innovationJsonLd(detail(), BASE) as Record<string, unknown>;
    expect(ld["@type"]).toBe("CreativeWork");
    expect(ld.url).toBe(`${BASE}/inovasi/pengering-padi`);
    expect(ld.name).toBe("[DUMMY] Pengering Padi");
    expect(ld.datePublished).toBe("2025-01-01T00:00:00.000Z");
    expect((ld.author as { name: string }[]).map((a) => a.name)).toEqual(["[DUMMY] Ketua", "[DUMMY] Anggota"]);
    expect(ld.inLanguage).toBe("id-ID");
  });

  it("membuang field kosong dan tidak pernah memuat data internal", () => {
    const ld = innovationJsonLd(detail({ abstract: null, typeName: null, publishedAt: null }), BASE);
    expect(ld).not.toHaveProperty("abstract");
    expect(ld).not.toHaveProperty("genre");
    expect(ld).not.toHaveProperty("datePublished");
    const text = JSON.stringify(ld);
    expect(text).not.toMatch(/identifier|nidn|nip|status|submittedBy/i);
  });
});

describe("researcherJsonLd", () => {
  const researcher = (over: Partial<ResearcherDetail> = {}): ResearcherDetail => ({
    slug: "siti",
    fullName: "[DUMMY] Siti",
    position: "[DUMMY] Lektor",
    facultyName: "[DUMMY] Teknik",
    studyProgramName: null,
    innovationCount: 1,
    bio: null,
    externalLinks: [{ label: "scholar", url: "https://scholar.google.com/x" }],
    innovations: [],
    ...over,
  });

  it("memuat nama, jabatan, afiliasi, dan tautan eksternal sebagai sameAs", () => {
    const ld = researcherJsonLd(researcher(), BASE) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Person");
    expect(ld.url).toBe(`${BASE}/peneliti/siti`);
    expect(ld.jobTitle).toBe("[DUMMY] Lektor");
    expect(ld.sameAs).toEqual(["https://scholar.google.com/x"]);
    expect(JSON.stringify(ld)).toContain("[DUMMY] Teknik");
    expect(ld).not.toHaveProperty("description");
  });

  it("tanpa tautan eksternal tidak ada sameAs", () => {
    expect(researcherJsonLd(researcher({ externalLinks: [] }), BASE)).not.toHaveProperty("sameAs");
  });
});

describe("websiteJsonLd dan breadcrumbJsonLd", () => {
  it("beranda: organisasi + situs dengan SearchAction ke katalog", () => {
    const ld = websiteJsonLd(BASE) as { "@graph": Record<string, unknown>[] };
    expect(ld["@graph"].map((n) => n["@type"])).toEqual(["CollegeOrUniversity", "WebSite"]);
    expect(JSON.stringify(ld)).toContain(`${BASE}/inovasi?q={search_term_string}`);
  });

  it("breadcrumb berurutan dengan URL absolut", () => {
    const ld = breadcrumbJsonLd(BASE, [
      { name: "Beranda", path: "/" },
      { name: "Inovasi", path: "/inovasi" },
    ]) as { itemListElement: { position: number; item: string }[] };
    expect(ld.itemListElement.map((i) => [i.position, i.item])).toEqual([
      [1, `${BASE}/`],
      [2, `${BASE}/inovasi`],
    ]);
  });
});
