import { describe, expect, it } from "vitest";
import { pageMetadata } from "./metadata";

describe("pageMetadata", () => {
  it("memuat title, description, canonical, Open Graph lengkap, dan Twitter", () => {
    const m = pageMetadata({ title: "Judul", description: "Deskripsi", path: "/inovasi/judul" });
    expect(m.title).toBe("Judul");
    expect(m.description).toBe("Deskripsi");
    expect(m.alternates?.canonical).toBe("/inovasi/judul");
    expect(m.openGraph).toMatchObject({
      type: "website",
      siteName: "Inovasi UNINUS",
      locale: "id_ID",
      title: "Judul",
      description: "Deskripsi",
      url: "/inovasi/judul",
    });
    expect(m.twitter).toMatchObject({ card: "summary", title: "Judul", description: "Deskripsi" });
  });

  it("artikel membawa waktu terbit dan penulis; jenis lain tidak", () => {
    const article = pageMetadata({
      title: "A",
      path: "/inovasi/a",
      type: "article",
      publishedTime: "2025-01-01T00:00:00.000Z",
      authors: ["[DUMMY] Ketua"],
    });
    expect(article.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2025-01-01T00:00:00.000Z",
      authors: ["[DUMMY] Ketua"],
    });

    const profile = pageMetadata({ title: "P", path: "/peneliti/p", type: "profile", publishedTime: "2025-01-01T00:00:00.000Z" });
    expect(profile.openGraph).toMatchObject({ type: "profile" });
    expect(profile.openGraph).not.toHaveProperty("publishedTime");
  });

  it("judul absolut tidak memakai akhiran template; gambar berbagi selalu ada dengan alt", () => {
    const home = pageMetadata({ title: "Beranda", absoluteTitle: true, path: "/" });
    expect(home.title).toEqual({ absolute: "Beranda" });
    const images = (home.openGraph as { images: { url: string; alt: string }[] }).images;
    expect(images[0].url).toBe("/brand/logo-uninus.png");
    expect(images[0].alt).not.toBe("");
  });
});
