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

export type TextbookUnitContent = {
  unitTitle: string;
  /** 핵심개념 */
  keyConcepts: string[];
  /** 내용학습 */
  contentStudy: string[];
  /** 핵심요약 */
  coreSummary: string[];
  /** 확인학습 */
  practice: string[];
  /** 단원평가 */
  unitTest: string[];
};

export type TextbookUnitDoc = TextbookUnitContent & {
  unitIndex: number;
  status: TextbookUnitStatus;
  model: string;
};
