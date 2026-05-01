/**
 * 지문 심층 분석 — 문장 단위 + 의미 단위(/) + 5단 구성 리포트 (schemaVersion 1)
 * 주제·제목·문장별 어휘는 영문(또는 지문 표기) + 한국어 해설 쌍.
 * 4·5번은 반드시 1:1 리스트(배열) — 각 원소가 [영문 표현] : [한국어] 한 줄에 대응.
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
  /** 직독직해 — meaningUnits와 같은 길이·순서: i번째 한국어 직역이 meaningUnits[i]에 대응 */
  literalTranslationUnits: string[];
  /** 전문 해석 — 영문 원문 문장 전체에 대한 자연스러운 한국어 통역 */
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
  /** 4. 핵심 표현 정리 — 각 항목이 한 줄: 영문 표현/구문 ↔ 한국어 뜻·해설 */
  keyExpressionsList: PassageDeepBilingualBlock[];
  /** 5. 핵심 문법·구문 — 각 항목이 한 줄: 영문 패턴 ↔ 한국어 설명 */
  keyGrammarSyntaxList: PassageDeepBilingualBlock[];
  /** 3. 문장별 심층 분석 */
  sentences: PassageDeepSentenceBlock[];
};
