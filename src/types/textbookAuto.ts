import type { LocalDocModule } from "@/lib/localDocumentAuto/manuscriptModules";

/** 교재 자동 생성 — 세션·단원 스키마 */
export const TEXTBOOK_AUTO_SCHEMA_VERSION = 1;

/** 2단계 정답·해설 문서 (answer_keys 서브컬렉션) */
export const TEXTBOOK_AUTO_ANSWER_KEY_SCHEMA_VERSION = 1;

export type TextbookUnitStatus = "draft" | "confirmed";

export type TextbookAssessmentBucket = "practice" | "unitTest";

/** AI 2단계 연동용 문항 스텁 */
export type TextbookAnswerKeyStub = {
  id: string;
  question: string;
};

export type TextbookAnswerKeyItem = {
  id: string;
  unitIndex: number;
  bucket: TextbookAssessmentBucket;
  orderIndex: number;
  question: string;
  answer: string;
  explanationBullets: string[];
};

/** 핵심개념: 개념명 — 설명 */
export type TextbookKeyConceptItem = {
  concept: string;
  explanation: string;
};

/** 내용학습: 소제목 + 불릿 설명(원문 사실 누락·과도 축약 금지) */
export type TextbookContentStudyBlock = {
  title: string;
  bullets: string[];
};

/** 단원평가: 주관식 단답 또는 객관식 */
export type TextbookUnitTestMcq = {
  kind: "mcq";
  question: string;
  choices: string[];
};

export type TextbookUnitTestShort = {
  kind: "short";
  question: string;
};

export type TextbookUnitTestItem = TextbookUnitTestMcq | TextbookUnitTestShort;

/** 최종 교재·AI 생성에 포함할 섹션 (미저장·구버전 문서는 전부 true로 간주) */
export type TextbookSectionInclusion = {
  keyConcepts: boolean;
  contentStudy: boolean;
  coreSummary: boolean;
  practice: boolean;
  unitTest: boolean;
};

export const MODULES_ONLY_SECTION_INCLUSION: TextbookSectionInclusion = {
  keyConcepts: false,
  contentStudy: false,
  coreSummary: false,
  practice: false,
  unitTest: false,
};

export const DEFAULT_SECTION_INCLUSION: TextbookSectionInclusion = {
  keyConcepts: true,
  contentStudy: true,
  coreSummary: true,
  practice: true,
  unitTest: true,
};

export type TextbookUnitContent = {
  unitTitle: string;
  keyConcepts: TextbookKeyConceptItem[];
  contentStudy: TextbookContentStudyBlock[];
  /** 핵심요약 */
  coreSummary: string[];
  /** 확인학습 — 주관식 단답형 질문 문장만 */
  practice: string[];
  unitTest: TextbookUnitTestItem[];
  sectionInclusion?: TextbookSectionInclusion;
  manuscriptModules?: LocalDocModule[];
};

export type TextbookUnitDoc = TextbookUnitContent & {
  unitIndex: number;
  status: TextbookUnitStatus;
  model: string;
};

/** 1단계 세션 폼 — 단원별 지문 (컴포넌트 상태) */
export type TextbookSetupPendingMode = "all" | "range" | "pages";

export type TextbookSetupPendingFile = {
  id: string;
  file: File;
  mode: TextbookSetupPendingMode;
  fromPage: string;
  toPage: string;
  pagesRaw: string;
};

export type TextbookSetupFileSegment = {
  id: string;
  fileName: string;
  extractNote: string;
  text: string;
};

/** 모듈 내 각 입력 칸의 소스 종류 */
export type SourceModuleFieldKey =
  | "passageNo"
  | "passage"
  | "question"
  | "options"
  | "passageAnalysis"
  | "keySummary"
  | "reviewStudy";

export const SOURCE_MODULE_FIELD_KEYS: SourceModuleFieldKey[] = [
  "passageNo",
  "passage",
  "question",
  "options",
  "passageAnalysis",
  "keySummary",
  "reviewStudy",
];

export const SOURCE_MODULE_FIELD_LABELS: Record<SourceModuleFieldKey, string> = {
  passageNo: "지문번호",
  passage: "지문",
  question: "문제",
  options: "선택지",
  passageAnalysis: "지문분석",
  keySummary: "핵심정리",
  reviewStudy: "확인학습",
};

export function defaultSourceModuleFieldModes(): Record<SourceModuleFieldKey, "manual" | "ai"> {
  return {
    passageNo: "manual",
    passage: "manual",
    question: "manual",
    options: "manual",
    passageAnalysis: "manual",
    keySummary: "manual",
    reviewStudy: "manual",
  };
}

/** 세션 시작 전 단원 원고 — 지문 세트(모듈) 단위 입력 */
export type TextbookUnitSourceModule = {
  id: string;
  /** 항목별 입력 방식 (누락 시 normalize 시 manual 로 보정) */
  fieldModes: Record<SourceModuleFieldKey, "manual" | "ai">;
  passageNo: string;
  passage: string;
  question: string;
  options: string;
  passageAnalysis: string;
  keySummary: string;
  reviewStudy: string;
};

export type TextbookUnitSetupState = {
  /** 단원별 자유 입력(레거시·마스터북 패널 등). 모듈과 병합 시 뒤에 붙습니다. */
  manualText: string;
  modules: TextbookUnitSourceModule[];
  fileSegments: TextbookSetupFileSegment[];
  pendingFiles: TextbookSetupPendingFile[];
};
