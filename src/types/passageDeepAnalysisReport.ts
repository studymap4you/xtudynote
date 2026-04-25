/**
 * 지문 심층 분석 — 문장 단위 + 의미 단위(/) + 5단 구성 리포트 (schemaVersion 1)
 */
export type PassageDeepSentenceBlock = {
  /** 1부터 순번 */
  sentenceIndex: number;
  /** 해당 문장 전체 (영문) */
  sentenceEnglish: string;
  /** 의미 단위로 나눈 조각 — 화면에서는 ` / ` 로 이어서 표시 */
  meaningUnits: string[];
  /** 직독직해 */
  literalTranslation: string;
  /** 전문 해석 */
  professionalInterpretation: string;
  /** 주요 어휘·표현 */
  keyVocabOrExpressions: string;
};

export type PassageDeepAnalysisReportJson = {
  schemaVersion: 1;
  /** 1. 주제 */
  theme: string;
  /** 2. 제목 */
  passageTitle: string;
  /** 4. 핵심 표현 정리 (지문 전체) */
  keyExpressionsSummary: string;
  /** 5. 핵심 문법·구문 (지문 전체) */
  keyGrammarSyntax: string;
  /** 3. 문장별 심층 분석 */
  sentences: PassageDeepSentenceBlock[];
};
