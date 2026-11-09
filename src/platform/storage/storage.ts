import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Penyimpanan berkas (ADR-005). Antarmuka kecil supaya bisa pindah ke S3-compatible tanpa mengubah
 * modul lain. Kunci selalu dibuat server; nilai dari pengguna tidak pernah dipakai sebagai kunci.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  /** null bila tidak ada. */
  get(key: string): Promise<Buffer | null>;
  /** Idempoten: menghapus yang tidak ada bukan galat. */
  delete(key: string): Promise<void>;
}

/** `ab/<uuid>.webp|pdf` atau varian kecil `ab/<uuid>-thumb.webp`. Folder dua karakter mencegah satu folder penuh. */
const KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-thumb)?\.(webp|pdf)$/;

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function createLocalStorage(root: string): StorageAdapter {
  const base = path.resolve(root);

  /** Menolak kunci di luar pola dan memastikan hasilnya tetap di dalam folder dasar (anti path traversal). */
  function resolveKey(key: string): string {
    if (!isValidStorageKey(key)) throw new Error("Kunci penyimpanan tidak valid.");
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error("Kunci penyimpanan tidak valid.");
    return full;
  }

  return {
    async put(key, data) {
      const full = resolveKey(key);
      await mkdir(path.dirname(full), { recursive: true });
      // Mode 0o640: tidak dapat dieksekusi dan tidak terbaca pengguna lain di server bersama.
      await writeFile(full, data, { mode: 0o640 });
    },
    async get(key) {
      try {
        return await readFile(resolveKey(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}
