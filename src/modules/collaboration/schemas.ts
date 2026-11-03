import { z } from "../../platform/http/zod";

/** Formulir publik permintaan kolaborasi (docs/UI_UX_GUIDELINES.md §10.4, SECURITY.md §6, §9). */
export const collaborationRequestSchema = z
  .object({
    innovationId: z.uuid("Inovasi tidak valid.").nullable().optional(),
    name: z.string().trim().min(2, "Nama wajib diisi.").max(150, "Nama terlalu panjang."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Email terlalu panjang.")
      .pipe(z.email("Format email tidak valid.")),
    organization: z.string().trim().min(2, "Instansi wajib diisi.").max(200, "Nama instansi terlalu panjang."),
    phone: z
      .string()
      .trim()
      .max(30, "Nomor telepon terlalu panjang.")
      .regex(/^[0-9+()\-\s]*$/, "Nomor telepon hanya boleh berisi angka, spasi, +, -, dan kurung.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    message: z.string().trim().min(10, "Pesan minimal 10 karakter.").max(1000, "Pesan maksimal 1000 karakter."),
    consent: z.literal(true, "Persetujuan penyimpanan data wajib dicentang."),
    /** Honeypot: manusia tidak melihatnya. Bila terisi, handler berpura-pura sukses tanpa menyimpan. */
    website: z.string().max(500).optional(),
  })
  .strict();

export type CollaborationRequestInput = z.infer<typeof collaborationRequestSchema>;
