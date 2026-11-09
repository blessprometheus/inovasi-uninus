import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalStorage, isValidStorageKey } from "./storage";

const ID = "0192f3a4-7b1c-7d2e-8f3a-123456789abc";
let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "inovasi-storage-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("isValidStorageKey", () => {
  it("menerima pola yang dibuat server", () => {
    expect(isValidStorageKey(`bc/${ID}.webp`)).toBe(true);
    expect(isValidStorageKey(`bc/${ID}-thumb.webp`)).toBe(true);
    expect(isValidStorageKey(`bc/${ID}.pdf`)).toBe(true);
  });

  it("menolak path traversal, jalur absolut, ekstensi lain, dan pola asal-asalan", () => {
    for (const key of [
      `../${ID}.webp`,
      `bc/../../etc/passwd`,
      `/etc/passwd`,
      `bc/${ID}.php`,
      `bc/${ID}.webp/../x.webp`,
      `bc\\${ID}.webp`,
      `bc/${ID}.WEBP`,
      `${ID}.webp`,
      `bcd/${ID}.webp`,
      `bc/x.webp`,
      "",
      `bc/${ID}.webp\u0000.php`,
    ]) {
      expect(isValidStorageKey(key), JSON.stringify(key)).toBe(false);
    }
  });
});

describe("createLocalStorage", () => {
  it("menyimpan, membaca, dan menghapus (idempoten)", async () => {
    const s = createLocalStorage(root);
    const key = `bc/${ID}.pdf`;
    await s.put(key, Buffer.from("isi"));
    expect((await s.get(key))?.toString()).toBe("isi");
    await s.delete(key);
    expect(await s.get(key)).toBeNull();
    await s.delete(key);
  });

  it("menolak kunci tidak valid di semua operasi, dan tidak menulis apa pun di luar folder dasar", async () => {
    const s = createLocalStorage(root);
    await expect(s.put("../luar.webp", Buffer.from("x"))).rejects.toThrow("tidak valid");
    await expect(s.get("../../etc/passwd")).rejects.toThrow("tidak valid");
    await expect(s.delete("/abs/path.pdf")).rejects.toThrow("tidak valid");
    expect(await readdir(path.dirname(root))).not.toContain("luar.webp");
  });

  it("membuat subfolder dua karakter sesuai kunci", async () => {
    const s = createLocalStorage(root);
    await s.put(`ab/${ID}.pdf`, Buffer.from("x"));
    expect(await readdir(root)).toContain("ab");
  });
});
