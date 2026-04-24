/** 주요 어휘 항목 */
export type SignalLogicVocabularyItem = {
  term: string;
  gloss: string;
};

/** [A]/[B] 키워드 분류 */
export type SignalLogicBinaryKeyword = {
  bucket: "A" | "B";
  keyword: string;
};

/** 시그널 단어 및 논리 기능 */
export type SignalLogicSignal = {
  word: string;
  /** 논리 기능 설명 (예: 전환, 인과, 범위 제한) */
  logicRole: string;
};

/** 정답 및 해설 */
export type SignalLogicCorrectAnswer = {
  option: number;
  explanation: string;
};

/**
 * Signal Logic Reading 분석 단위 — 통합 대시보드·상세 화면에서 공통 사용.
 */
export type SignalLogicPassageAnalysis = {
  id: string;
  /** 카드·목록용 짧은 제목 */
  title: string;
  analyzedAt: string;
  /** 지문 원문 */
  originalText: string;
  /** 전문 해석 */
  translation: string;
  /** 주요 어휘 */
  vocabulary: SignalLogicVocabularyItem[];
  /** [A]/[B] 키워드 분류 */
  binaryLogic: SignalLogicBinaryKeyword[];
  /** 시그널 단어 및 논리 기능 */
  signals: SignalLogicSignal[];
  /** 정답 번호 및 해설 */
  correctAnswer: SignalLogicCorrectAnswer;
};
