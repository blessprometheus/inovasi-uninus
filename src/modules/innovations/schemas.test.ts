import { describe, expect, it } from "vitest";
import {
  innovationDraftSchema,
  innovationPatchSchema,
  missingForSubmission,
  publicationInputSchema,
} from "./schemas";

const valid = {
  title: "Pupuk organik cair untuk padi",
  summary: "Pupuk cair dari limbah pertanian yang meningkatkan hasil panen.",
};
const UUID = "0198a3b2-7c4d-7e11-9a5f-3b6d2c1e4f80";
const UUID2 = "0198a3b2-7c4d-7e11-9a5f-3b6d2c1e4f81";

const issueFor = (res: ReturnType<typeof innovationDraftSchema.safeParse>, field: string) =>
  !res.success ? res.error.issues.find((i) => i.path.join(".") === field) : undefined;

describe("innovationDraftSchema", () => {
  it("menerima draft minimal (cukup judul)", () => {
    expect(innovationDraftSchema.safeParse(valid).success).toBe(true);
    expect(innovationDraftSchema.safeParse({ title: valid.title }).success).toBe(true);
    expect(innovationDraftSchema.safeParse({ title: valid.title, summary: "" }).success).toBe(true);
  });

  it("ringkasan, bila diisi, minimal 20 dan maksimal 500 karakter", () => {
    expect(issueFor(innovationDraftSchema.safeParse({ title: valid.title, summary: "terlalu pendek" }), "summary")?.message).toBe(
      "Ringkasan minimal 20 karakter.",
    );
    expect(innovationDraftSchema.safeParse({ title: valid.title, summary: "x".repeat(501) }).success).toBe(false);
    expect(innovationPatchSchema.safeParse({ summary: "" }).success).toBe(true);
  });

  it("hanya judul yang wajib, dengan pesan Bahasa Indonesia", () => {
    const res = innovationDraftSchema.safeParse({});
    expect(res.success).toBe(false);
    expect(issueFor(res, "title")).toBeDefined();
    expect(issueFor(res, "summary")).toBeUndefined();
    expect(innovationDraftSchema.safeParse({ ...valid, title: "abc" })).toMatchObject({ success: false });
    expect(issueFor(innovationDraftSchema.safeParse({ ...valid, title: "abc" }), "title")?.message).toBe(
      "Judul minimal 5 karakter.",
    );
  });

  it("memangkas spasi dan mengubah teks opsional kosong menjadi null", () => {
    const res = innovationDraftSchema.parse({ ...valid, title: "  Judul Uji Coba  ", abstract: "   " });
    expect(res.title).toBe("Judul Uji Coba");
    expect(res.abstract).toBeNull();
  });

  it("menolak field yang tidak boleh dikirim klien (status, slug, pemilik, unggulan)", () => {
    for (const forbidden of [
      { status: "published" },
      { slug: "x" },
      { submittedBy: UUID },
      { isFeatured: true },
      { id: UUID },
    ]) {
      expect(innovationDraftSchema.safeParse({ ...valid, ...forbidden }).success, JSON.stringify(forbidden)).toBe(
        false,
      );
    }
  });

  it("membatasi tahun dan memastikan bilangan bulat", () => {
    expect(innovationDraftSchema.safeParse({ ...valid, year: 2024 }).success).toBe(true);
    expect(innovationDraftSchema.safeParse({ ...valid, year: 1800 }).success).toBe(false);
    expect(innovationDraftSchema.safeParse({ ...valid, year: 2024.5 }).success).toBe(false);
    expect(innovationDraftSchema.safeParse({ ...valid, year: "2024" }).success).toBe(false);
  });

  it("memvalidasi UUID untuk relasi", () => {
    expect(innovationDraftSchema.safeParse({ ...valid, facultyId: "bukan-uuid" }).success).toBe(false);
    expect(innovationDraftSchema.safeParse({ ...valid, categoryIds: [UUID], facultyId: UUID2 }).success).toBe(true);
  });

  it("ketua tidak boleh juga anggota, dan anggota tidak boleh duplikat", () => {
    const dupLead = innovationDraftSchema.safeParse({
      ...valid,
      leadResearcherId: UUID,
      memberResearcherIds: [UUID],
    });
    expect(issueFor(dupLead, "memberResearcherIds")?.message).toBe("Ketua tidak boleh juga terdaftar sebagai anggota.");
    const dupMember = innovationDraftSchema.safeParse({ ...valid, memberResearcherIds: [UUID, UUID] });
    expect(issueFor(dupMember, "memberResearcherIds")?.message).toBe("Anggota tidak boleh duplikat.");
  });

  it("membatasi ukuran teks panjang", () => {
    expect(innovationDraftSchema.safeParse({ ...valid, abstract: "a".repeat(5001) }).success).toBe(false);
    expect(innovationDraftSchema.safeParse({ ...valid, description: "a".repeat(10000) }).success).toBe(true);
  });
});

describe("tautan publikasi", () => {
  it("hanya http/https", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.id/f", "file:///etc/passwd", "contoh.id"]) {
      expect(publicationInputSchema.safeParse({ title: "t", url: bad }).success, bad).toBe(false);
    }
    for (const good of ["https://doi.org/10.1/x", "http://contoh.id/a?b=1"]) {
      expect(publicationInputSchema.safeParse({ title: "t", url: good }).success, good).toBe(true);
    }
  });
});

describe("innovationPatchSchema", () => {
  it("menerima pembaruan parsial tetapi tetap memvalidasi field yang dikirim", () => {
    expect(innovationPatchSchema.safeParse({}).success).toBe(true);
    expect(innovationPatchSchema.safeParse({ title: "Judul baru yang valid" }).success).toBe(true);
    expect(innovationPatchSchema.safeParse({ title: "abc" }).success).toBe(false);
    expect(innovationPatchSchema.safeParse({ status: "published" }).success).toBe(false);
  });
});

describe("missingForSubmission", () => {
  it("melaporkan semua syarat yang belum terpenuhi", () => {
    expect(missingForSubmission({}).map((m) => m.field)).toEqual([
      "title",
      "summary",
      "categoryIds",
      "leadResearcherId",
    ]);
  });
  it("tidak ada yang kurang bila lengkap", () => {
    expect(
      missingForSubmission({ ...valid, categoryIds: [UUID], leadResearcherId: UUID2 }),
    ).toEqual([]);
  });
  it("teks yang hanya spasi dianggap kosong", () => {
    const m = missingForSubmission({ title: "   ", summary: "  ", categoryIds: [UUID], leadResearcherId: UUID2 });
    expect(m.map((x) => x.field)).toEqual(["title", "summary"]);
  });
});
