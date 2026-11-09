import type { Person } from "@/components/researcher-picker";

/**
 * Tipe dan nilai awal formulir. Sengaja BUKAN modul "use client": nilai yang diekspor dari modul klien
 * menjadi referensi di server dan tidak bisa dipakai (mis. di-spread) oleh Server Component.
 */

export interface FormValues {
  title: string;
  summary: string;
  abstract: string;
  background: string;
  problemStatement: string;
  objective: string;
  methodology: string;
  description: string;
  advantages: string;
  benefits: string;
  developmentPotential: string;
  year: string;
  typeId: string;
  facultyId: string;
  studyProgramId: string;
  categoryIds: string[];
  lead: Person | null;
  members: Person[];
  publications: { title: string; url: string; doi: string; venue: string; year: string }[];
  intellectualProperties: {
    kind: "hki" | "paten" | "lainnya";
    status: string;
    registrationNumber: string;
    year: string;
    notes: string;
  }[];
}

export interface FormRefs {
  categories: { id: string; name: string }[];
  types: { id: string; name: string }[];
  faculties: { id: string; name: string }[];
  studyPrograms: { id: string; name: string; facultyId: string }[];
}

export const EMPTY_VALUES: FormValues = {
  title: "",
  summary: "",
  abstract: "",
  background: "",
  problemStatement: "",
  objective: "",
  methodology: "",
  description: "",
  advantages: "",
  benefits: "",
  developmentPotential: "",
  year: "",
  typeId: "",
  facultyId: "",
  studyProgramId: "",
  categoryIds: [],
  lead: null,
  members: [],
  publications: [],
  intellectualProperties: [],
};

