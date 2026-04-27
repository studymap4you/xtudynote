/** 영어 지문 자동 변환 학습 — 단어 쌍 */
export type EnglishVocabPair = {
  id: string;
  word: string;
  meaning: string;
};

/** 문장 단위: 직독직해 빈칸 · 영작 */
export type EnglishSentenceWork = {
  id: string;
  english: string;
  koreanFull: string;
  /** 직독직해용: 빈칸이 들어간 한국어 해석 (예: 그는 _____에 갔다.) */
  koreanWithBlanks: string;
  /** 빈칸에 들어갈 한국어 조각 (채점용, 복수 가능) */
  blankAnswersKo: string[];
  /** 영작: 한국어 안내 문장 */
  compositionKorean: string;
  /** 영작 모범 영어 문장 */
  compositionEnglish: string;
};

export type EnglishPassageAnalysis = {
  vocabulary: EnglishVocabPair[];
  sentences: EnglishSentenceWork[];
};
