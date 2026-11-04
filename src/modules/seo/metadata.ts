import type { Metadata } from "next";

const SITE_NAME = "Inovasi UNINUS";

/**
 * Logo satu-satunya gambar yang tersedia; berukuran kecil (73x100, OQ-04) sehingga kartu berbagi memakai
 * format `summary`, bukan gambar lebar. Diganti sampul inovasi / logo besar bila sudah ada.
 */
const SHARE_IMAGE = {
  url: "/brand/logo-uninus.png",
  width: 73,
  height: 100,
  alt: "Logo Universitas Islam Nusantara",
};

export interface PageMetaInput {
  title: string;
  /** Judul tanpa akhiran "| Inovasi UNINUS" (untuk beranda). */
  absoluteTitle?: boolean;
  description?: string;
  /** Jalur kanonik halaman, mis. `/inovasi/slug`. */
  path: string;
  type?: "website" | "article" | "profile";
  publishedTime?: string | null;
  authors?: string[];
}

/**
 * Metadata lengkap satu halaman: judul, deskripsi, canonical, Open Graph, dan Twitter.
 * Open Graph pada Next.js menggantikan (bukan menggabungkan) milik layout, jadi dibangun utuh di sini.
 */
export function pageMetadata(input: PageMetaInput): Metadata {
  const { title, description, path, type = "website" } = input;
  return {
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: type === "profile" ? "profile" : type === "article" ? "article" : "website",
      siteName: SITE_NAME,
      locale: "id_ID",
      title,
      description,
      url: path,
      images: [SHARE_IMAGE],
      ...(type === "article" && input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(type === "article" && input.authors?.length ? { authors: input.authors } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [SHARE_IMAGE.url],
    },
  };
}
