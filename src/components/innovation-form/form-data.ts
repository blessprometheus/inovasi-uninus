import type { OwnInnovation } from "@/modules/innovations/service";
import { getResearcherLookup, getTaxonomyService } from "@/platform/auth/runtime";
import type { FormRefs, FormValues } from "./form-types";

/** Daftar acuan untuk pilihan di formulir (hanya item aktif). */
export async function loadFormRefs(): Promise<FormRefs> {
  const taxonomy = getTaxonomyService();
  const [categories, types, faculties, studyPrograms] = await Promise.all([
    taxonomy.listPublic("categories"),
    taxonomy.listPublic("innovation-types"),
    taxonomy.listPublic("faculties"),
    taxonomy.listPublic("study-programs"),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    types: types.map((t) => ({ id: t.id, name: t.name })),
    faculties: faculties.map((f) => ({ id: f.id, name: f.name })),
    studyPrograms: studyPrograms.map((s) => ({ id: s.id, name: s.name, facultyId: s.facultyId ?? "" })),
  };
}

/** Nilai awal formulir dari inovasi yang tersimpan; nama peneliti diambil dari id. */
export async function toFormValues(inv: OwnInnovation): Promise<FormValues> {
  const ids = [...(inv.leadResearcherId ? [inv.leadResearcherId] : []), ...inv.memberResearcherIds];
  const people = new Map((await getResearcherLookup().byIds(ids)).map((p) => [p.id, { id: p.id, name: p.fullName }]));
  const s = (v: string | null) => v ?? "";
  return {
    title: inv.title,
    summary: inv.summary,
    abstract: s(inv.abstract),
    background: s(inv.background),
    problemStatement: s(inv.problemStatement),
    objective: s(inv.objective),
    methodology: s(inv.methodology),
    description: s(inv.description),
    advantages: s(inv.advantages),
    benefits: s(inv.benefits),
    developmentPotential: s(inv.developmentPotential),
    year: inv.year?.toString() ?? "",
    typeId: s(inv.typeId),
    facultyId: s(inv.facultyId),
    studyProgramId: s(inv.studyProgramId),
    categoryIds: inv.categoryIds,
    lead: inv.leadResearcherId ? (people.get(inv.leadResearcherId) ?? null) : null,
    members: inv.memberResearcherIds.flatMap((id) => people.get(id) ?? []),
    publications: inv.publications.map((p) => ({
      title: p.title,
      url: s(p.url),
      doi: s(p.doi),
      venue: s(p.venue),
      year: p.year?.toString() ?? "",
    })),
    intellectualProperties: inv.intellectualProperties.map((p) => ({
      kind: p.kind,
      status: s(p.status),
      registrationNumber: s(p.registrationNumber),
      year: p.year?.toString() ?? "",
      notes: s(p.notes),
    })),
  };
}
