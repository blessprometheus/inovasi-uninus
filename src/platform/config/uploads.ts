import path from "node:path";
import { createLocalStorage, type StorageAdapter } from "@/platform/storage/storage";

/** Batas unggahan (docs/SECURITY.md §5), dapat diubah lewat variabel lingkungan. */
export interface UploadLimits {
  maxImageBytes: number;
  maxDocumentBytes: number;
  maxFilesPerInnovation: number;
}

function megabytes(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 1024 * 1024) : fallback * 1024 * 1024;
}

export function getUploadLimits(env: Record<string, string | undefined> = process.env): UploadLimits {
  return {
    maxImageBytes: megabytes(env.UPLOAD_MAX_IMAGE_MB, 5),
    maxDocumentBytes: megabytes(env.UPLOAD_MAX_DOC_MB, 20),
    maxFilesPerInnovation: 20,
  };
}

/** Folder berkas di luar web root. Bawaan `./storage` (diabaikan git); produksi mengisi STORAGE_PATH. */
export function getStorageRoot(env: Record<string, string | undefined> = process.env): string {
  // Lokasi ditentukan saat berjalan dan sengaja di luar proyek; tanpa penanda ini Next menelusuri seluruh proyek
  // ke paket standalone (ribuan berkas, merugikan di server yang inodenya sudah penuh, OQ-01).
  return path.resolve(/*turbopackIgnore: true*/ env.STORAGE_PATH || "./storage");
}

let cached: StorageAdapter | undefined;
export function getStorage(): StorageAdapter {
  cached ??= createLocalStorage(getStorageRoot());
  return cached;
}
