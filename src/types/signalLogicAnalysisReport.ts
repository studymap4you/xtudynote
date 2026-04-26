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
  /** 대립이 드러나는 지문 문장을 그대로 인용 */
  keySentenceQuote?: string;
  /** 키워드 선정·문맥상 대조 근거 (한국어, 2~3문장 이상 권장). **볼드** 마크다운 허용 */
  rationaleKo?: string;
  /** A(긍정·기존 등) ↔ B(부정·새 개념 등) 논리 관계를 서술 (한국어). **볼드** 허용 */
  relationKo?: string;
};

export type SignalLogicCoreSignalWord = {
  word: string;
  /** 논리 기능 (예: 전환, 범위 제한) */
  role: string;
  /** 원샷 시그널 태그 (선택) */
  functionTag?: string;
  /** ① 현상 제시 — 이 시그널이 왜 주목되는지 (한국어, 2~3문장). **볼드** 허용 */
  phenomenonKo?: string;
  /** ② 근거 — 해당 시그널이 들어 있는 지문 문장을 철자·구두점까지 그대로 인용 */
  evidenceQuote?: string;
  /** ③ 논리 해설 — 지문에서의 역할·기능(전환·범위·양보 등) (한국어, 2~3문장). **볼드** 허용 */
  explanationKo?: string;
  /** 시그널 이후 논지 전환·심화 흐름(Flow) 요약 (한국어). **볼드** 허용 */
  flowKo?: string;
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
  /** 지문을 관통하는 단 하나의 One-Shot Signal 단어(영문 표기) */
  oneShotSignalWord: string;
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
