/** 교재 자동 생성 1단계 — 단원별 5섹션 JSON (표 금지, 리스트만) */
export const TEXTBOOK_AUTO_SCHEMA_VERSION = 1;

export type TextbookUnitStatus = "draft" | "confirmed";

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
