import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("menerima jalur internal, termasuk query", () => {
    expect(safeNextPath("/dosen")).toBe("/dosen");
    expect(safeNextPath("/dosen/inovasi/abc/edit?x=1")).toBe("/dosen/inovasi/abc/edit?x=1");
  });

  it("menolak alamat luar dan trik penulisan ulang", () => {
    for (const bad of [
      "https://jahat.example",
      "//jahat.example",
      "/\\jahat.example",
      "javascript:alert(1)",
      "jahat.example",
      "/ok\r\nSet-Cookie: x=1",
      "/ok\\evil",
    ]) {
      expect(safeNextPath(bad)).toBe("/dosen");
    }
  });

  it("menolak kembali ke login/API, kosong, terlalu panjang; array memakai elemen pertama", () => {
    expect(safeNextPath("/masuk?next=/dosen")).toBe("/dosen");
    expect(safeNextPath("/api/v1/auth/me")).toBe("/dosen");
    expect(safeNextPath(undefined)).toBe("/dosen");
    expect(safeNextPath("")).toBe("/dosen");
    expect(safeNextPath("/" + "a".repeat(400))).toBe("/dosen");
    expect(safeNextPath(["/admin", "https://x.example"])).toBe("/admin");
    expect(safeNextPath(null, "/")).toBe("/");
  });
});
