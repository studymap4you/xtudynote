export type CurriculumCatalogId = "high_school" | "supplementary" | "csat";

export type TextbookCourseId =
  | "common1"
  | "common2"
  | "english1"
  | "english2"
  | "reading_writing"
  | "advanced"
  | "general";

export type TextbookResourceCategoryId =
  | "textbook_general"
  | `textbook_${Exclude<TextbookCourseId, "general">}_${string}`;

export type CsatResourceCategoryId = `csat_${number}`;

export type CurriculumCategoryId =
  | "grade1_mock"
  | "grade2_mock"
  | "grade3_mock"
  | "high_school_csat"
  | "ebs_special_lecture"
  | "ebs_complete"
  | "olympos"
  | "supplementary_archive"
  | "csat_archive"
  | CsatResourceCategoryId
  | TextbookResourceCategoryId;

export interface CurriculumCategory {
  id: CurriculumCategoryId;
  label: string;
  labelEn: string;
}

export interface CurriculumCatalog {
  id: CurriculumCatalogId;
  title: string;
  titleEn: string;
  basePath: string;
  categories: CurriculumCategory[];
}

export interface TextbookCatalogGroup {
  id: TextbookCourseId;
  label: string;
  labelEn: string;
  availableYear: number;
  categories: CurriculumCategory[];
}

export interface CurriculumResourceFile {
  name: string;
  path: string;
  size: number;
  contentType: string;
}

export interface CurriculumResourceRow {
  id: string;
  catalog: CurriculumCatalogId;
  category: CurriculumCategoryId;
  title: string;
  description: string;
  files: CurriculumResourceFile[];
  authorId: string;
  createdAtMs: number;
}
