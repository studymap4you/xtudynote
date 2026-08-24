import type {
  CurriculumCatalogId,
  CurriculumCategoryId,
  TextbookResourceCategoryId,
} from "@/types/curriculumResource";

export interface CurriculumPlacement {
  catalog: CurriculumCatalogId;
  category: CurriculumCategoryId;
}

const CATALOG_IDS = new Set<CurriculumCatalogId>(["high_school", "supplementary", "csat"]);
const CSAT_MENU_YEARS = new Set([2022, 2023, 2024, 2025, 2026]);

function cleanText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function compactText(value: unknown): string {
  return cleanText(value).replace(/[^0-9a-z가-힣]+/gu, "");
}

function dedupe(placements: CurriculumPlacement[]): CurriculumPlacement[] {
  const seen = new Set<string>();
  return placements.filter((placement) => {
    const key = `${placement.catalog}:${placement.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function explicitPlacements(data: Record<string, unknown>): CurriculumPlacement[] {
  const fromArray = Array.isArray(data.resourcePlacements)
    ? data.resourcePlacements.flatMap((raw): CurriculumPlacement[] => {
        if (!raw || typeof raw !== "object") return [];
        const item = raw as Record<string, unknown>;
        const catalog = cleanText(item.catalog) as CurriculumCatalogId;
        const category = cleanText(item.category) as CurriculumCategoryId;
        return CATALOG_IDS.has(catalog) && category ? [{ catalog, category }] : [];
      })
    : [];
  if (fromArray.length) return dedupe(fromArray);

  const catalog = cleanText(data.resourceCatalog) as CurriculumCatalogId;
  const category = cleanText(data.resourceCategory) as CurriculumCategoryId;
  return CATALOG_IDS.has(catalog) && category ? [{ catalog, category }] : [];
}

function collectSearchText(data: Record<string, unknown>): string {
  const scalarFields = [
    data.subject,
    data.title,
    data.identifier,
    data.learningTopic,
    data.introduction,
    data.section,
    data.sourceDatabase,
  ];
  const arrayFields = [
    data.learningMaterialFilePaths,
    data.referenceMaterialFilePaths,
    data.themes,
  ];
  const resourceFileNames = Array.isArray(data.resourceFiles)
    ? data.resourceFiles.flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const file = raw as Record<string, unknown>;
        return [file.name, file.path];
      })
    : [];
  return [...scalarFields, ...arrayFields.flat(), ...resourceFileNames]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

export function textbookSourceIdToCategory(value: unknown): TextbookResourceCategoryId | null {
  const identifier = cleanText(value).replace(/_/gu, "-");
  const prefixes: Array<[string, string]> = [
    ["common-english-1-", "textbook_common1_"],
    ["common-english-2-", "textbook_common2_"],
    ["english-1-", "textbook_english1_"],
    ["english-2-", "textbook_english2_"],
    ["reading-writing-", "textbook_reading_writing_"],
    ["advanced-english-", "textbook_advanced_"],
  ];
  const match = prefixes.find(([prefix]) => identifier.startsWith(prefix));
  if (!match) return null;
  const suffix = identifier.slice(match[0].length).replace(/-/gu, "_");
  return suffix ? (`${match[1]}${suffix}` as TextbookResourceCategoryId) : null;
}

function csatYear(text: string): number | null {
  const academicYear = text.match(/(?:^|\D)(20\d{2})\s*학년도/u);
  if (academicYear) return Number(academicYear[1]);
  const identifierYear = compactText(text).match(/csatenglish(20\d{2})/u);
  if (identifierYear) return Number(identifierYear[1]);
  const generalYear = text.match(/(?:^|\D)(20\d{2})(?:\D|$)/u);
  return generalYear ? Number(generalYear[1]) : null;
}

function csatPlacement(year: number | null): CurriculumPlacement {
  return {
    catalog: "csat",
    category: year && CSAT_MENU_YEARS.has(year) ? (`csat_${year}` as CurriculumCategoryId) : "csat_archive",
  };
}

export function inferCurriculumPlacements(data: Record<string, unknown>): CurriculumPlacement[] {
  const explicit = explicitPlacements(data);
  if (explicit.length) return explicit;
  if (cleanText(data.libraryCategory) === "source_material") return [];

  const text = collectSearchText(data);
  const compact = compactText(text);
  if (!compact) return [];

  if (compact.includes("수능특강") || compact.includes("ebsspecial")) {
    return [{ catalog: "high_school", category: "ebs_special_lecture" }];
  }
  if (compact.includes("수능완성") || compact.includes("ebscomplete") || compact.includes("ebsfinalenglish")) {
    return [{ catalog: "high_school", category: "ebs_complete" }];
  }
  if (compact.includes("올림포스") || compact.includes("olympos")) {
    return [{ catalog: "high_school", category: "olympos" }];
  }

  const gradeMatch = compact.match(/고([123])/u);
  if ((compact.includes("모의고사") || compact.includes("모의평가") || compact.includes("학력평가")) && gradeMatch) {
    return [{ catalog: "high_school", category: `grade${gradeMatch[1]}_mock` as CurriculumCategoryId }];
  }

  const isCsatExam = [
    "대학수학능력시험",
    "csatenglish",
    "3교시영어영역",
    "영어영역문제지",
    "영어영역정답표",
  ].some((marker) => compact.includes(marker));
  if (isCsatExam) {
    return dedupe([
      { catalog: "high_school", category: "high_school_csat" },
      csatPlacement(csatYear(text)),
    ]);
  }

  const textbookCategory = textbookSourceIdToCategory(data.identifier);
  if (textbookCategory) return [{ catalog: "supplementary", category: textbookCategory }];
  if (
    compact.includes("영어교과서")
    || compact.includes("공통영어")
    || compact.includes("englishtextbook")
  ) {
    return [{ catalog: "supplementary", category: "textbook_general" }];
  }

  if (cleanText(data.libraryCategory) === "problem_bank") {
    return [{ catalog: "high_school", category: "supplementary_archive" }];
  }
  return [];
}
