import { describe, expect, it } from "vitest";
import { buildSitemap } from "./sitemap";

const BASE = "https://inovasi.uninus.ac.id";

describe("buildSitemap", () => {
  it("tanpa data hanya memuat halaman statis tanpa lastModified", () => {
    const map = buildSitemap(BASE, [], []);
    expect(map.map((e) => e.url)).toEqual([`${BASE}/`, `${BASE}/inovasi`, `${BASE}/peneliti`]);
    for (const e of map) expect(e).not.toHaveProperty("lastModified");
  });

  it("memuat URL inovasi dan peneliti dengan tanggal ubah dari data", () => {
    const map = buildSitemap(
      BASE,
      [{ slug: "padi-hemat-air", updatedAt: "2025-03-01T10:00:00.000Z" }],
      [{ slug: "nama-peneliti", updatedAt: "2025-04-02T10:00:00.000Z" }],
    );
    const inv = map.find((e) => e.url === `${BASE}/inovasi/padi-hemat-air`);
    const res = map.find((e) => e.url === `${BASE}/peneliti/nama-peneliti`);
    expect(inv?.lastModified).toEqual(new Date("2025-03-01T10:00:00.000Z"));
    expect(res?.lastModified).toEqual(new Date("2025-04-02T10:00:00.000Z"));
  });

  it("tidak pernah memuat rute admin atau dosen", () => {
    const urls = buildSitemap(BASE, [{ slug: "a", updatedAt: "2025-01-01T00:00:00.000Z" }], []).map(
      (e) => e.url,
    );
    expect(urls.some((u) => /\/(admin|dosen|api)\b/.test(u))).toBe(false);
  });
});
