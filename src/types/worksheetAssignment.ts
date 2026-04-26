import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";

/** 학습지 문항 유형 */
export type WorksheetItemKind = "blank" | "short" | "handwriting";

/** 과제에 포함되는 한 문항 (answerKey는 선생님·DB용, 학생 UI/PDF에서는 비표시) */
export type WorksheetItem = {
  id: string;
  kind: WorksheetItemKind;
  prompt: string;
  /** 참고 정답·모범 답 (학생 화면·학생용 PDF에서 제외) */
  answerKey?: string;
};

export type AssignmentSchemaVersion = 1;

/** 최상위 `assignments` 컬렉션 문서 */
export type WorksheetAssignmentDoc = {
  schemaVersion: AssignmentSchemaVersion;
  teacherId: string;
  title: string;
  /** 지문 본문 */
  passage: string;
  /** Signal Logic 분석 JSON (선택, 복원·교사용) */
  analysis: SignalLogicAnalysisReportJson | Record<string, unknown>;
  /** 배포(시작) 시각 — 학생 과제함 정렬 기준 */
  distributedAt: unknown;
  /** 대상 학생 Firebase Auth UID 목록 */
  targetStudentIds: string[];
  worksheetItems: WorksheetItem[];
  createdAt: unknown;
  /** 이메일로 발송 완료된 미가입 수신자 수 (서버 기록) */
  outreachEmailSent?: number;
};

/** `assignments/{id}/distribution_recipients/{docId}` — PII, 교사·슈퍼관리자만 읽기 */
export type DistributionRecipientDoc = {
  displayName: string;
  phone: string;
  emailLower: string;
  matchedStudentUid: string | null;
  delivery: "app" | "email";
  emailSentAt: unknown | null;
  createdAt: unknown;
  note?: string;
};

export type StudentWorkStatus = "draft" | "submitted";

/** `assignments/{id}/submission_events/{eventId}` — 학생 제출 시 기록, 선생님 알림용 */
export type WorksheetSubmissionEventDoc = {
  studentId: string;
  kind: "submitted";
  createdAt: unknown;
};

/** `assignments/{id}/student_work/{studentUid}` */
export type StudentWorkDoc = {
  studentId: string;
  /** item id → 텍스트 또는 손글씨 이미지 data URL */
  answers: Record<string, string>;
  status: StudentWorkStatus;
  updatedAt: unknown;
  submittedAt?: unknown;
};
