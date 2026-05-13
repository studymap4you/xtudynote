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

/** 학생용 본문에서 확인학습·해설을 문항 직후 vs 말미 부록으로 둘 때 사용 */
export type TextbookAnswerKeyLayout = "inline" | "appendix";

export const DEFAULT_TEXTBOOK_ANSWER_KEY_LAYOUT: TextbookAnswerKeyLayout = "appendix";

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
  /** 편집기·인쇄(인라인)용. 정답·해설은 answer_keys와 동기화됩니다. */
  answer?: string;
  explanationBullets?: string[];
};

export type TextbookUnitTestShort = {
  kind: "short";
  question: string;
  answer?: string;
  explanationBullets?: string[];
};

export type TextbookUnitTestItem = TextbookUnitTestMcq | TextbookUnitTestShort;

/** 확인학습 (주관식 단답) — 질문 필수, 정답·해설은 선택 */
export type TextbookPracticeItem = {
  question: string;
  answer?: string;
  explanationBullets?: string[];
};

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
  /** 확인학습 — 주관식 단답형 (질문 + 선택 정답·해설) */
  practice: TextbookPracticeItem[];
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

/** 모듈 내 문제·선택지 (복수 문항) */
export type SetupQuestionKind = "mcq" | "short";
export type SetupContentLang = "ko" | "en";

export type TextbookModuleSubQuestion = {
  id: string;
  kind: SetupQuestionKind;
  lang: SetupContentLang;
  stem: string;
  options: string;
  stemMode: "manual" | "ai";
  optionsMode: "manual" | "ai";
};

export type TextbookUnitReviewStudySetup = {
  /** 생성·작성할 확인학습 문항 수 (1–20) */
  questionCount: number;
  lang: SetupContentLang;
  fieldMode: "manual" | "ai";
  body: string;
};

export type TextbookUnitEvalQuestionSetup = {
  id: string;
  kind: "mcq" | "short";
  lang: SetupContentLang;
  stemMode: "manual" | "ai";
  /** 객관식 선택지 칸만 */
  optionsMode: "manual" | "ai";
  stem: string;
  /** 5지선다: ①… 한 줄씩 */
  options: string;
};

export type TextbookUnitEvaluationSetup = {
  mcqCount: number;
  shortCount: number;
  questions: TextbookUnitEvalQuestionSetup[];
};

export function emptySubQuestion(): TextbookModuleSubQuestion {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `sq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    kind: "mcq",
    lang: "ko",
    stem: "",
    options: "",
    stemMode: "manual",
    optionsMode: "manual",
  };
}

export function defaultReviewStudySetup(): TextbookUnitReviewStudySetup {
  return { questionCount: 3, lang: "ko", fieldMode: "manual", body: "" };
}

function newEvalQuestion(kind: "mcq" | "short"): TextbookUnitEvalQuestionSetup {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    kind,
    lang: "ko",
    stemMode: "manual",
    optionsMode: "manual",
    stem: "",
    options: "",
  };
}

export function normalizeEvalQuestionSlots(mcq: number, short: number, prev: TextbookUnitEvalQuestionSetup[]): TextbookUnitEvalQuestionSetup[] {
  const next: TextbookUnitEvalQuestionSetup[] = [];
  for (let i = 0; i < mcq; i++) {
    const old = prev[i];
    next.push(old && old.kind === "mcq" ? old : newEvalQuestion("mcq"));
  }
  for (let j = 0; j < short; j++) {
    const idx = mcq + j;
    const old = prev[idx];
    next.push(old && old.kind === "short" ? old : newEvalQuestion("short"));
  }
  return next;
}

export function defaultUnitEvaluationSetup(): TextbookUnitEvaluationSetup {
  const mcq = 2;
  const short = 1;
  return { mcqCount: mcq, shortCount: short, questions: normalizeEvalQuestionSlots(mcq, short, []) };
}

export function normalizeUnitEvaluationSetup(raw: Partial<TextbookUnitEvaluationSetup> | undefined): TextbookUnitEvaluationSetup {
  const mcq = Math.min(20, Math.max(0, Math.floor(raw?.mcqCount ?? 2)));
  const short = Math.min(20, Math.max(0, Math.floor(raw?.shortCount ?? 1)));
  const prev = Array.isArray(raw?.questions) ? raw!.questions! : [];
  return { mcqCount: mcq, shortCount: short, questions: normalizeEvalQuestionSlots(mcq, short, prev) };
}

export function normalizeReviewStudySetup(raw: Partial<TextbookUnitReviewStudySetup> | undefined): TextbookUnitReviewStudySetup {
  const d = defaultReviewStudySetup();
  const n = Math.min(20, Math.max(1, Math.floor(raw?.questionCount ?? d.questionCount)));
  const lang = raw?.lang === "en" ? "en" : "ko";
  const fieldMode = raw?.fieldMode === "ai" ? "ai" : "manual";
  const body = typeof raw?.body === "string" ? raw.body : "";
  return { questionCount: n, lang, fieldMode, body };
}

/** 모듈 내 각 입력 칸의 소스 종류 */
export type SourceModuleFieldKey = "passageNo" | "passage" | "passageAnalysis" | "keySummary";

export const SOURCE_MODULE_FIELD_KEYS: SourceModuleFieldKey[] = ["passageNo", "passage", "passageAnalysis", "keySummary"];

export const SOURCE_MODULE_FIELD_LABELS: Record<SourceModuleFieldKey, string> = {
  passageNo: "지문번호",
  passage: "지문",
  passageAnalysis: "지문분석",
  keySummary: "핵심정리",
};

export function defaultSourceModuleFieldModes(): Record<SourceModuleFieldKey, "manual" | "ai"> {
  return {
    passageNo: "manual",
    passage: "manual",
    passageAnalysis: "manual",
    keySummary: "manual",
  };
}

/** 세션 시작 전 단원 원고 — 지문 세트(모듈) 단위 입력 */
export type TextbookUnitSourceModule = {
  id: string;
  /** 항목별 입력 방식 (누락 시 normalize 시 manual 로 보정) */
  fieldModes: Record<SourceModuleFieldKey, "manual" | "ai">;
  passageNo: string;
  passage: string;
  /** 복수 문항(발문·선택지 통합 UI) */
  subQuestions: TextbookModuleSubQuestion[];
  passageAnalysis: string;
  keySummary: string;
};

export type TextbookUnitSetupState = {
  /** 단원별 자유 입력(레거시·마스터북 패널 등). 모듈과 병합 시 뒤에 붙습니다. */
  manualText: string;
  modules: TextbookUnitSourceModule[];
  fileSegments: TextbookSetupFileSegment[];
  pendingFiles: TextbookSetupPendingFile[];
  /** 단원 단위 확인학습 */
  reviewStudy: TextbookUnitReviewStudySetup;
  unitEvaluation: TextbookUnitEvaluationSetup;
};
