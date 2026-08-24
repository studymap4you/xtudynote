export type CurriculumCatalogId = "high_school" | "supplementary" | "csat";

export type CurriculumCategoryId =
  | "grade1_mock"
  | "grade2_mock"
  | "grade3_mock"
  | "high_school_csat"
  | "ebs_special_lecture"
  | "ebs_complete"
  | "olympos"
  | "csat_archive";

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
