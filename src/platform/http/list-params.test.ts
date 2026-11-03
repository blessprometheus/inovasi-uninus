import { describe, expect, it } from "vitest";
import { parseListParams } from "./list-params";

describe("parseListParams", () => {
  it("memakai nilai default bila kosong", () => {
    expect(parseListParams({})).toEqual({ q: undefined, page: 1 });
  });

  it("memangkas spasi dan membatasi q sampai 100 karakter", () => {
    expect(parseListParams({ q: "  padi  " }).q).toBe("padi");
    expect(parseListParams({ q: "a".repeat(300) }).q).toHaveLength(100);
    expect(parseListParams({ q: "   " }).q).toBeUndefined();
  });

  it("mengambil nilai pertama bila parameter berulang", () => {
    expect(parseListParams({ q: ["satu", "dua"], page: ["3", "9"] })).toEqual({ q: "satu", page: 3 });
  });

  it("menolak halaman tidak valid dan membatasi batas atas", () => {
    for (const bad of ["0", "-2", "abc", ""]) expect(parseListParams({ page: bad }).page).toBe(1);
    expect(parseListParams({ page: "99999999" }).page).toBe(10_000);
  });
});
