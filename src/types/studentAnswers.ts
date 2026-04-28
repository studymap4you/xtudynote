/**
 * 강의실 배포 시험 — 학생 단답형 채점 결과 (DB `student_answers` 컬렉션)
 */
export type ShortAnswerEvaluation = {
  isCorrect: boolean;
  /** 0–100, 키워드 누락 감점 반영 후 값 */
  score: number;
  /** 학생에게 보여줄 피드백 (한국어 위주) */
  comment: string;
  /** 채점 시 누락된 필수 키워드 (선택, UI·감사용) */
  missingKeywords?: string[];
};

export type McqEvaluation = {
  isCorrect: boolean;
  score: number;
  comment: string;
};

export type StudentAnswerPerQuestion =
  | {
      type: "short";
      answerText: string;
      evaluation: ShortAnswerEvaluation;
    }
  | {
      type: "mcq";
      selectedIndex: string;
      evaluation: McqEvaluation;
    };

/**
 * 문서 ID 권장: `${assignmentId}_${studentId}` (멱등 업서트)
 */
export type StudentAnswersDocument = {
  assignmentId: string;
  classroomId: string;
  examId: string;
  studentId: string;
  teacherId: string;
  /** 문항 id → 응답·채점 */
  perQuestion: Record<string, StudentAnswerPerQuestion>;
  /** 주관식 가중 평균 등 단순 합산 (0–100) */
  aggregateScore: number;
  submittedAt: unknown;
  updatedAt: unknown;
};
