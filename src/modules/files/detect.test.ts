import { describe, expect, it } from "vitest";
import { detectUpload, sniffMime } from "./detect";

const bytes = (...head: number[]) => Uint8Array.from([...head, ...new Array(32).fill(0)]);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, ...new Array(20).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);

describe("sniffMime (magic bytes)", () => {
  it("mengenali JPEG, PNG, WebP, dan PDF dari isinya", () => {
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(WEBP)).toBe("image/webp");
    expect(sniffMime(PDF)).toBe("application/pdf");
  });

  it("menolak HTML, executable, berkas kosong/terlalu pendek, dan RIFF bukan WebP", () => {
    expect(sniffMime(HTML)).toBeNull();
    expect(sniffMime(EXE)).toBeNull();
    expect(sniffMime(new Uint8Array(0))).toBeNull();
    expect(sniffMime(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull();
    const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45, 0, 0]);
    expect(sniffMime(wav)).toBeNull();
  });
});

describe("detectUpload (ekstensi + MIME + isi harus konsisten)", () => {
  it("menerima kombinasi yang cocok", () => {
    expect(detectUpload({ filename: "foto.JPG", declaredMime: "image/jpeg", bytes: JPEG })).toEqual({ ok: true, file: { kind: "image", mime: "image/jpeg" } });
    expect(detectUpload({ filename: "a.jpeg", declaredMime: "image/jpeg", bytes: JPEG }).ok).toBe(true);
    expect(detectUpload({ filename: "a.png", declaredMime: "image/png", bytes: PNG }).ok).toBe(true);
    expect(detectUpload({ filename: "a.webp", declaredMime: "image/webp", bytes: WEBP }).ok).toBe(true);
    expect(detectUpload({ filename: "laporan.pdf", declaredMime: "application/pdf", bytes: PDF })).toEqual({ ok: true, file: { kind: "document", mime: "application/pdf" } });
  });

  it("MIME dengan parameter tetap diterima", () => {
    expect(detectUpload({ filename: "a.png", declaredMime: "image/png; charset=binary", bytes: PNG }).ok).toBe(true);
  });

  it("menolak polyglot: HTML/EXE yang menyamar sebagai gambar atau PDF", () => {
    expect(detectUpload({ filename: "x.jpg", declaredMime: "image/jpeg", bytes: HTML }).ok).toBe(false);
    expect(detectUpload({ filename: "x.pdf", declaredMime: "application/pdf", bytes: EXE }).ok).toBe(false);
    expect(detectUpload({ filename: "x.png", declaredMime: "image/png", bytes: JPEG }).ok).toBe(false);
    expect(detectUpload({ filename: "x.pdf", declaredMime: "application/pdf", bytes: PNG }).ok).toBe(false);
  });

  it("menolak MIME yang diklaim tidak sesuai isi", () => {
    expect(detectUpload({ filename: "x.jpg", declaredMime: "text/html", bytes: JPEG }).ok).toBe(false);
    expect(detectUpload({ filename: "x.jpg", declaredMime: "", bytes: JPEG }).ok).toBe(false);
  });

  it("menolak ekstensi di luar daftar putih, termasuk yang berbahaya dan ekstensi ganda", () => {
    for (const name of ["x.svg", "x.html", "x.exe", "x.php", "x.js", "x.gif", "x", "x.pdf.exe", "x.php.jpg.svg"]) {
      expect(detectUpload({ filename: name, declaredMime: "image/jpeg", bytes: JPEG }).ok, name).toBe(false);
    }
  });

  it("pesan penolakan berbahasa Indonesia", () => {
    const r = detectUpload({ filename: "x.exe", declaredMime: "application/octet-stream", bytes: EXE });
    expect(r.ok ? "" : r.message).toMatch(/tidak didukung/);
  });
});
