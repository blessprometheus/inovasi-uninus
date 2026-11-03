import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("huruf kecil, spasi dan tanda baca menjadi satu tanda hubung", () => {
    expect(slugify("Pupuk Organik Cair, untuk Padi!")).toBe("pupuk-organik-cair-untuk-padi");
  });
  it("menghapus diakritik dan mengganti & dengan dan", () => {
    expect(slugify("Rancang Bangun Alat Café & Energi")).toBe("rancang-bangun-alat-cafe-dan-energi");
  });
  it("menetralkan karakter berbahaya dan path traversal", () => {
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("<script>alert(1)</script>")).toBe("script-alert-1-script");
    expect(slugify("a/b\\c?d=e")).toBe("a-b-c-d-e");
  });
  it("memakai nilai cadangan untuk teks kosong atau tanpa huruf/angka", () => {
    expect(slugify("")).toBe("inovasi");
    expect(slugify("!!!")).toBe("inovasi");
    expect(slugify("日本語")).toBe("inovasi");
  });
  it("memotong ke 80 karakter tanpa tanda hubung di ujung", () => {
    const s = slugify("kata ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });
  it("hasil hanya berisi a-z, 0-9, dan tanda hubung", () => {
    expect(slugify("Ünïcödé 123 — tes")).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("uniqueSlug", () => {
  it("memakai slug dasar bila belum dipakai", async () => {
    expect(await uniqueSlug("Judul Uji", async () => false)).toBe("judul-uji");
  });
  it("menambah akhiran -2, -3 hingga unik", async () => {
    const taken = new Set(["judul-uji", "judul-uji-2"]);
    expect(await uniqueSlug("Judul Uji", async (c) => taken.has(c))).toBe("judul-uji-3");
  });
  it("tetap dalam batas panjang saat memberi akhiran", async () => {
    const long = "a".repeat(100);
    const base = "a".repeat(80);
    const slug = await uniqueSlug(long, async (c) => c === base);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-2")).toBe(true);
  });
  it("gagal dengan jelas bila semua kandidat terpakai", async () => {
    await expect(uniqueSlug("x", async () => true, 3)).rejects.toThrow("slug unik");
  });
});
