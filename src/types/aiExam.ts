/** AI/수동 통합 시험 문항 (본문 근거 필수) */
export type AiExamQuestionType = "mcq" | "short";

export type AiExamQuestion = {
  id: string;
  source: "manual" | "ai";
  type: AiExamQuestionType;
  prompt: string;
  /** 객관식 4개 선택지 */
  options?: string[];
  /**
   * 객관식: "0".."3" 문자열 인덱스
   * 주관식: 모범 답안(영어 과목은 본문 근거 문장을 그대로 적도록 유도)
   */
  correctAnswer: string;
  /** 본문에서 인용한 근거 (짧은 인용문) */
  evidenceQuote: string;
  /** 해설(근거 연결) */
  explanation: string;
};

export type AiExamVisibility = "link";

export type AiExamDocument = {
  teacherId: string;
  title: string;
  subject: string;
  passage: string;
  totalItems: number;
  /** AI 생성 구간 기준 객관식 비율 0–100 */
  objectiveRatioPercent: number;
  visibility: AiExamVisibility;
  questions: AiExamQuestion[];
  createdAt: unknown;
};
