/**
 * Signal Logic 분석 리포트 — JSON으로 저장·확장하기 위한 단일 스키마.
 * 필드를 추가할 때는 schemaVersion을 올리거나 optional 필드로 확장하세요.
 */
export type SignalLogicBinaryOpposition = {
  /** 이분법 한쪽 (예: 효율) */
  poleA: string;
  /** 대립 극 (예: 공정) */
  poleB: string;
  /** 대립 축 한 줄 설명 */
  axisLabel: string;
};

export type SignalLogicCoreSignalWord = {
  word: string;
  /** 논리 기능 (예: 전환, 범위 제한) */
  role: string;
  /** 원샷 시그널 태그 (선택) */
  functionTag?: string;
};

export type SignalLogicVocabItem = {
  term: string;
  gloss: string;
};

/** AI·Firestore 공통 구조 (JSON 직렬화) */
export type SignalLogicAnalysisReportJson = {
  schemaVersion: 1;
  /** 주제문(핵심 논지 한 줄) */
  topicThesis: string;
  /** 핵심 시그널 단어 */
  coreSignalWords: SignalLogicCoreSignalWord[];
  /** 이분법 논리적 대립 쌍 */
  binaryOppositions: SignalLogicBinaryOpposition[];
  /** 구문·논리 분석 설명 (본문보다 작은 글씨로 UI 표시) */
  analysisNarrative: string;
  /** 어휘 정리 */
  vocabularyItems: SignalLogicVocabItem[];
  /** 원샷 시그널 보조 노트 (선택) */
  signalOneShotNotes?: string[];
};
