/**
 * 지문 심층 분석 — 문장 단위 + 의미 단위(/) + 5단 구성 리포트 (schemaVersion 1)
 * 주제·제목·어휘·4·5번은 영문(또는 지문 표기) + 한국어 해설을 반드시 쌍으로 둡니다.
 */

/** 영어(또는 지문 인용) + 한국어 해설 */
export type PassageDeepBilingualBlock = {
  english: string;
  koreanExplanation: string;
};

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
  /** 주요 어휘·표현 (항목별 영어 + 한국어 해설) */
  keyVocabItems: PassageDeepBilingualBlock[];
};

export type PassageDeepAnalysisReportJson = {
  schemaVersion: 1;
  /** 1. 주제 — 영문 요지/핵심 문장 등 + 한국어 해설 */
  theme: PassageDeepBilingualBlock;
  /** 2. 제목 — 영문 제목(또는 제안 영문) + 한국어 설명 */
  passageTitle: PassageDeepBilingualBlock;
  /** 4. 핵심 표현 정리 — 영문 표현·구문 나열 + 한국어 해설 */
  keyExpressionsSummary: PassageDeepBilingualBlock;
  /** 5. 핵심 문법·구문 — 영문 구문/패턴 + 한국어 해설 */
  keyGrammarSyntax: PassageDeepBilingualBlock;
  /** 3. 문장별 심층 분석 */
  sentences: PassageDeepSentenceBlock[];
};
