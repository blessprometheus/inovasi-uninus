import { createHash } from "node:crypto";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { v7 as uuidv7 } from "uuid";
import { can, type AuthUser } from "@/modules/auth/authorize";
import {
  failure,
  NOT_FOUND,
  runService,
  type ServiceResult,
  type Tx,
} from "@/modules/innovations/service-core";
import { recordAudit } from "@/platform/audit/audit";
import type { UploadLimits } from "@/platform/config/uploads";
import type { Database } from "@/platform/db/client";
import { innovationFiles, innovations } from "@/platform/db/schema";
import { z } from "@/platform/http/zod";
import type { StorageAdapter } from "@/platform/storage/storage";
import { detectUpload } from "./detect";

export interface FileItem {
  id: string;
  kind: "image" | "document";
  visibility: "public" | "restricted";
  title: string | null;
  altText: string | null;
  mimeType: string;
  sizeBytes: number;
  isCover: boolean;
  createdAt: string;
}

export interface FileContent {
  mime: string;
  bytes: Buffer;
  sha256: string;
  /** Nama berkas aman untuk Content-Disposition. */
  filename: string;
}

const DISPLAY_PX = 1600;
const THUMB_PX = 480;
/** Batas piksel masukan: gambar raksasa kecil di berkas bisa menghabiskan memori saat didekode. */
const MAX_INPUT_PIXELS = 40_000_000;

const patchSchema = z
  .strictObject({
    title: z.string().trim().max(150, "Judul maksimal 150 karakter.").nullable().optional(),
    altText: z.string().trim().max(300, "Teks alternatif maksimal 300 karakter.").nullable().optional(),
    visibility: z.enum(["public", "restricted"], "Visibilitas tidak dikenal.").optional(),
    isCover: z.literal(true, "Sampul hanya dapat ditetapkan, bukan dicabut. Pilih gambar lain sebagai sampul.").optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Tidak ada yang diubah.");

const uuid = z.uuid();
const issues = (error: z.ZodError) =>
  error.issues.map((i) => ({ field: i.path.join(".") || "(umum)", message: i.message }));

const keyFor = (id: string, ext: "webp" | "pdf", thumb = false) => `${id.slice(-2)}/${id}${thumb ? "-thumb" : ""}.${ext}`;

/** Judul bawaan dari nama berkas: tanpa ekstensi dan tanpa karakter kontrol; hanya sebagai teks. */
function titleFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[_-]+/g, " ").trim();
  return base ? base.slice(0, 150) : null;
}

async function reencodeImage(bytes: Buffer): Promise<{ display: Buffer; thumb: Buffer }> {
  // Tanpa withMetadata(), sharp membuang EXIF/ICC/XMP (termasuk lokasi GPS). rotate() menerapkan
  // orientasi EXIF dulu supaya gambar tidak miring setelah metadatanya hilang.
  const open = () => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
  const resize = (px: number) => open().resize({ width: px, height: px, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  return { display: await resize(DISPLAY_PX), thumb: await resize(THUMB_PX) };
}

/**
 * Berkas inovasi: sampul dan dokumen, diunggah operator dari berkas fisik yang diserahkan dosen.
 * Pemeriksaan: ekstensi + MIME + magic bytes, batas ukuran, gambar di-re-encode (SECURITY.md §5).
 */
export function createFilesService(
  db: Database,
  storage: StorageAdapter,
  limits: UploadLimits,
  hooks: { onPublicChange?: () => void } = {},
) {
  const run = <T,>(fn: (tx: Tx) => Promise<T>): Promise<ServiceResult<T>> => runService(db, fn);

  /** 404 bagi yang tidak berhak (konsisten dengan layanan admin lain). */
  function requireManage(actor: AuthUser) {
    if (!can(actor, "file.manage_any")) NOT_FOUND();
  }

  async function lockInnovation(tx: Tx, id: string) {
    if (!uuid.safeParse(id).success) NOT_FOUND();
    const [row] = await tx
      .select({ id: innovations.id, title: innovations.title, status: innovations.status })
      .from(innovations)
      .where(and(eq(innovations.id, id), isNull(innovations.deletedAt)))
      .for("update");
    if (!row) NOT_FOUND();
    return row!;
  }

  async function loadFile(tx: Tx, fileId: string) {
    if (!uuid.safeParse(fileId).success) NOT_FOUND();
    const [row] = await tx.select().from(innovationFiles).where(eq(innovationFiles.id, fileId)).for("update");
    if (!row || !row.storageKey) NOT_FOUND();
    return row!;
  }

  const toItem = (r: typeof innovationFiles.$inferSelect): FileItem => ({
    id: r.id,
    kind: r.kind as "image" | "document",
    visibility: r.visibility,
    title: r.title,
    altText: r.altText,
    mimeType: r.mimeType ?? "application/octet-stream",
    sizeBytes: r.sizeBytes ?? 0,
    isCover: r.isCover,
    createdAt: r.createdAt.toISOString(),
  });

  return {
    async upload(
      actor: AuthUser,
      innovationId: string,
      input: {
        filename: string;
        declaredMime: string;
        bytes: Buffer;
        title?: string | null;
        altText?: string | null;
        visibility?: string | null;
        isCover?: boolean;
      },
    ): Promise<ServiceResult<FileItem>> {
      if (!can(actor, "file.manage_any")) return { ok: false, code: "NOT_FOUND", message: "Data tidak ditemukan." };

      const detected = detectUpload(input);
      if (!detected.ok) {
        return { ok: false, code: "VALIDATION_ERROR", message: detected.message, details: [{ field: "file", message: detected.message }] };
      }
      const { file } = detected;
      const maxBytes = file.kind === "image" ? limits.maxImageBytes : limits.maxDocumentBytes;
      if (input.bytes.length > maxBytes) {
        const mb = Math.round(maxBytes / (1024 * 1024));
        const message = `Ukuran berkas melebihi batas ${mb} MB untuk ${file.kind === "image" ? "gambar" : "dokumen"}.`;
        return { ok: false, code: "PAYLOAD_TOO_LARGE", message, details: [{ field: "file", message }] };
      }
      const visibility = input.visibility ?? (file.kind === "image" ? "public" : "restricted");
      if (visibility !== "public" && visibility !== "restricted") {
        return { ok: false, code: "VALIDATION_ERROR", message: "Visibilitas tidak dikenal.", details: [{ field: "visibility", message: "Visibilitas tidak dikenal." }] };
      }

      // Pekerjaan CPU (re-encode) dikerjakan sebelum transaksi supaya baris inovasi tidak terkunci lama.
      let stored: { key: string; bytes: Buffer }[];
      const id = uuidv7();
      if (file.kind === "image") {
        try {
          const { display, thumb } = await reencodeImage(input.bytes);
          stored = [
            { key: keyFor(id, "webp"), bytes: display },
            { key: keyFor(id, "webp", true), bytes: thumb },
          ];
        } catch {
          const message = "Gambar rusak atau tidak dapat dibaca.";
          return { ok: false, code: "VALIDATION_ERROR", message, details: [{ field: "file", message }] };
        }
      } else {
        stored = [{ key: keyFor(id, "pdf"), bytes: input.bytes }];
      }

      const written: string[] = [];
      try {
        for (const s of stored) {
          await storage.put(s.key, s.bytes);
          written.push(s.key);
        }
        const mainKey = stored[0].key;
        const mainBytes = stored[0].bytes;
        const mime = file.kind === "image" ? "image/webp" : file.mime;

        const result = await run(async (tx) => {
          requireManage(actor);
          const inv = await lockInnovation(tx, innovationId);
          const [total] = await tx.select({ n: count() }).from(innovationFiles).where(eq(innovationFiles.innovationId, inv.id));
          if (total.n >= limits.maxFilesPerInnovation) {
            failure("VALIDATION_ERROR", `Maksimal ${limits.maxFilesPerInnovation} berkas per inovasi.`, [
              { field: "file", message: `Maksimal ${limits.maxFilesPerInnovation} berkas per inovasi.` },
            ]);
          }

          let isCover = false;
          if (file.kind === "image") {
            const [existing] = await tx
              .select({ id: innovationFiles.id })
              .from(innovationFiles)
              .where(and(eq(innovationFiles.innovationId, inv.id), eq(innovationFiles.isCover, true)));
            // Gambar pertama otomatis jadi sampul; berikutnya hanya bila diminta.
            isCover = !existing || input.isCover === true;
            if (isCover && existing) {
              await tx.update(innovationFiles).set({ isCover: false }).where(eq(innovationFiles.id, existing.id));
            }
          }

          const [row] = await tx
            .insert(innovationFiles)
            .values({
              id,
              innovationId: inv.id,
              kind: file.kind,
              visibility,
              title: input.title?.trim().slice(0, 150) || titleFromFilename(input.filename),
              altText: file.kind === "image" ? input.altText?.trim().slice(0, 300) || inv.title.slice(0, 300) : null,
              storageKey: mainKey,
              mimeType: mime,
              sizeBytes: mainBytes.length,
              sha256: createHash("sha256").update(mainBytes).digest("hex"),
              isCover,
              uploadedBy: actor.id,
            })
            .returning();
          await recordAudit(tx, {
            actorId: actor.id,
            action: "file.upload",
            entityType: "innovation",
            entityId: inv.id,
            changes: { fileId: id, kind: file.kind, sizeBytes: mainBytes.length, visibility },
          });
          return { item: toItem(row), published: inv.status === "published" };
        });

        if (!result.ok) {
          await Promise.all(written.map((k) => storage.delete(k)));
          return result;
        }
        if (result.data.published) hooks.onPublicChange?.();
        return { ok: true, data: result.data.item };
      } catch (error) {
        await Promise.all(written.map((k) => storage.delete(k).catch(() => undefined)));
        throw error;
      }
    },

    async list(actor: AuthUser, innovationId: string): Promise<ServiceResult<FileItem[]>> {
      return run(async (tx) => {
        requireManage(actor);
        const inv = await lockInnovation(tx, innovationId);
        const rows = await tx
          .select()
          .from(innovationFiles)
          .where(eq(innovationFiles.innovationId, inv.id))
          .orderBy(asc(innovationFiles.createdAt), asc(innovationFiles.id));
        return rows.filter((r) => r.storageKey).map(toItem);
      });
    },

    async update(actor: AuthUser, fileId: string, rawPatch: unknown): Promise<ServiceResult<FileItem>> {
      let published = false;
      const result = await run(async (tx) => {
        requireManage(actor);
        const row = await loadFile(tx, fileId);
        const parsed = patchSchema.safeParse(rawPatch);
        if (!parsed.success) return failure("VALIDATION_ERROR", "Data yang dikirim tidak valid.", issues(parsed.error));
        const patch = parsed.data;
        if (patch.isCover && row.kind !== "image") {
          failure("VALIDATION_ERROR", "Hanya gambar yang dapat menjadi sampul.", [{ field: "isCover", message: "Hanya gambar yang dapat menjadi sampul." }]);
        }
        if (patch.isCover && row.visibility === "restricted" && patch.visibility !== "public") {
          failure("VALIDATION_ERROR", "Sampul harus berstatus publik.", [{ field: "isCover", message: "Sampul harus berstatus publik." }]);
        }
        const inv = await lockInnovation(tx, row.innovationId);
        const set: Partial<typeof innovationFiles.$inferInsert> = {};
        if (patch.title !== undefined) set.title = patch.title || null;
        if (patch.altText !== undefined) set.altText = row.kind === "image" ? patch.altText || null : null;
        if (patch.visibility !== undefined) set.visibility = patch.visibility;
        // Sampul yang dijadikan restricted tidak boleh tetap sampul: katalog publik tidak bisa memuatnya.
        if (patch.visibility === "restricted" && row.isCover) set.isCover = false;
        if (patch.isCover) {
          await tx
            .update(innovationFiles)
            .set({ isCover: false })
            .where(and(eq(innovationFiles.innovationId, row.innovationId), eq(innovationFiles.isCover, true)));
          set.isCover = true;
        }
        await tx.update(innovationFiles).set(set).where(eq(innovationFiles.id, row.id));
        await recordAudit(tx, {
          actorId: actor.id,
          action: "file.update",
          entityType: "innovation",
          entityId: row.innovationId,
          changes: { fileId: row.id, fields: Object.keys(patch) },
        });
        published = inv.status === "published";
        const [fresh] = await tx.select().from(innovationFiles).where(eq(innovationFiles.id, row.id));
        return toItem(fresh);
      });
      if (result.ok && published) hooks.onPublicChange?.();
      return result;
    },

    async remove(actor: AuthUser, fileId: string): Promise<ServiceResult<{ deleted: true }>> {
      let keys: string[] = [];
      let published = false;
      const result = await run(async (tx) => {
        requireManage(actor);
        const row = await loadFile(tx, fileId);
        const inv = await lockInnovation(tx, row.innovationId);
        await tx.delete(innovationFiles).where(eq(innovationFiles.id, row.id));
        if (row.isCover) {
          // Sampul dihapus: gambar publik berikutnya naik supaya kartu katalog tidak kehilangan gambar.
          const [next] = await tx
            .select({ id: innovationFiles.id })
            .from(innovationFiles)
            .where(
              and(
                eq(innovationFiles.innovationId, row.innovationId),
                eq(innovationFiles.kind, "image"),
                eq(innovationFiles.visibility, "public"),
              ),
            )
            .orderBy(asc(innovationFiles.createdAt))
            .limit(1);
          if (next) await tx.update(innovationFiles).set({ isCover: true }).where(eq(innovationFiles.id, next.id));
        }
        await recordAudit(tx, {
          actorId: actor.id,
          action: "file.delete",
          entityType: "innovation",
          entityId: row.innovationId,
          changes: { fileId: row.id, kind: row.kind },
        });
        keys = row.kind === "image" ? [row.storageKey!, row.storageKey!.replace(/\.webp$/, "-thumb.webp")] : [row.storageKey!];
        published = inv.status === "published";
        return { deleted: true as const };
      });
      if (result.ok) {
        // Setelah commit: kegagalan menghapus berkas fisik hanya meninggalkan yatim, bukan data yang salah.
        await Promise.all(keys.map((k) => storage.delete(k).catch(() => undefined)));
        if (published) hooks.onPublicChange?.();
      }
      return result;
    },

    /**
     * Isi berkas untuk disajikan. `scope: "public"` hanya untuk berkas publik milik inovasi yang terbit;
     * `scope: "admin"` untuk pemegang `file.manage_any`. Null bila tidak ada atau tidak boleh (tanpa membedakan).
     */
    async read(
      scope: { type: "public" } | { type: "admin"; actor: AuthUser },
      fileId: string,
      variant: "display" | "thumb" = "display",
    ): Promise<FileContent | null> {
      if (!uuid.safeParse(fileId).success) return null;
      if (scope.type === "admin" && !can(scope.actor, "file.manage_any")) return null;

      const [row] = await db
        .select({ file: innovationFiles, status: innovations.status, deletedAt: innovations.deletedAt })
        .from(innovationFiles)
        .innerJoin(innovations, eq(innovations.id, innovationFiles.innovationId))
        .where(eq(innovationFiles.id, fileId));
      if (!row || !row.file.storageKey || !row.file.mimeType) return null;
      if (scope.type === "public") {
        if (row.file.visibility !== "public" || row.status !== "published" || row.deletedAt) return null;
      }

      const useThumb = variant === "thumb" && row.file.kind === "image";
      const key = useThumb ? row.file.storageKey.replace(/\.webp$/, "-thumb.webp") : row.file.storageKey;
      const bytes = await storage.get(key);
      if (!bytes) return null;
      const ext = row.file.kind === "image" ? "webp" : "pdf";
      const slug =
        (row.file.title ?? "berkas")
          .normalize("NFKD")
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .toLowerCase()
          .slice(0, 80) || "berkas";
      return {
        mime: row.file.mimeType,
        bytes,
        sha256: useThumb ? createHash("sha256").update(bytes).digest("hex") : (row.file.sha256 ?? ""),
        filename: `${slug}.${ext}`,
      };
    },
  };
}

export type FilesService = ReturnType<typeof createFilesService>;
