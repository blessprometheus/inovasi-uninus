import type { OwnInnovation } from "@/modules/innovations/service";

export interface NamedRefs {
  categories: { id: string; name: string }[];
  types: { id: string; name: string }[];
  faculties: { id: string; name: string }[];
  studyPrograms: { id: string; name: string }[];
}

const LONG_TEXTS = [
  ["abstract", "Abstrak"],
  ["background", "Latar belakang"],
  ["problemStatement", "Rumusan masalah"],
  ["objective", "Tujuan"],
  ["methodology", "Metodologi"],
  ["description", "Deskripsi inovasi"],
  ["advantages", "Keunggulan"],
  ["benefits", "Manfaat"],
  ["developmentPotential", "Potensi pengembangan"],
] as const;

const IP_KIND = { hki: "HKI", paten: "Paten", lainnya: "Lainnya" } as const;

const CARD = "rounded-card border border-border bg-surface p-5 sm:p-6";

/**
 * Isi pengajuan dalam mode baca. Dipakai halaman detail dosen dan halaman tinjau admin supaya
 * keduanya selalu menampilkan hal yang sama. Bagian kosong tidak ditampilkan. Semua teks dirender
 * sebagai teks biasa (ADR-006), tautan publikasi hanya http/https (divalidasi di server).
 */
export function InnovationReadonly({
  inv,
  refs,
  people,
}: {
  inv: OwnInnovation;
  refs: NamedRefs;
  /** id peneliti -> nama. */
  people: Map<string, string>;
}) {
  const nameOf = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? null;

  const facts: [string, string | null][] = [
    ["Kategori", inv.categoryIds.map((c) => nameOf(refs.categories, c)).filter(Boolean).join(", ") || null],
    ["Jenis", nameOf(refs.types, inv.typeId)],
    ["Tahun", inv.year?.toString() ?? null],
    ["Fakultas", nameOf(refs.faculties, inv.facultyId)],
    ["Program studi", nameOf(refs.studyPrograms, inv.studyProgramId)],
    ["Ketua peneliti", inv.leadResearcherId ? (people.get(inv.leadResearcherId) ?? null) : null],
    ["Anggota tim", inv.memberResearcherIds.map((m) => people.get(m)).filter(Boolean).join(", ") || null],
  ];

  return (
    <>
      <section aria-labelledby="ringkasan" className={`mt-8 ${CARD}`}>
        <h2 id="ringkasan" className="text-xl font-semibold">
          Ringkasan
        </h2>
        <p className="mt-2 whitespace-pre-line">{inv.summary}</p>
        <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      {LONG_TEXTS.filter(([key]) => inv[key]).map(([key, label]) => (
        <section key={key} aria-labelledby={`t-${key}`} className={`mt-6 ${CARD}`}>
          <h2 id={`t-${key}`} className="text-xl font-semibold">
            {label}
          </h2>
          <p className="mt-2 whitespace-pre-line">{inv[key]}</p>
        </section>
      ))}

      {inv.publications.length > 0 ? (
        <section aria-labelledby="publikasi" className={`mt-6 ${CARD}`}>
          <h2 id="publikasi" className="text-xl font-semibold">
            Publikasi
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {inv.publications.map((p, i) => (
              <li key={i}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-primary hover:underline">
                    {p.title}
                  </a>
                ) : (
                  <span className="font-semibold">{p.title}</span>
                )}
                <span className="text-muted-foreground">
                  {[p.venue, p.year, p.doi ? `DOI ${p.doi}` : null].filter(Boolean).map((x) => ` · ${x}`).join("")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inv.intellectualProperties.length > 0 ? (
        <section aria-labelledby="hki" className={`mt-6 ${CARD}`}>
          <h2 id="hki" className="text-xl font-semibold">
            HKI / Paten
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {inv.intellectualProperties.map((p, i) => (
              <li key={i}>
                <span className="font-semibold">{IP_KIND[p.kind]}</span>
                {[p.status, p.registrationNumber, p.year, p.notes].filter(Boolean).map((x) => ` · ${x}`).join("")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
