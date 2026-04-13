import type { LearningThemeId } from "@/types/learningTheme";

export type ContentType = "share" | "paid" | "homework";
export type ContentStatus = "pending" | "approved" | "rejected";

export interface ContentDocument {
  authorId: string;
  subject: string;
  audience: string;
  section: string;
  identifier: string;
  learningTopic: string;
  introduction: string;
  lectureLink: string | null;
  learningMaterialFilePaths: string[];
  referenceMaterialFilePaths: string[];
  type?: ContentType;
  status?: ContentStatus;
  /** 테마별 분류 (복수 선택) */
  themes?: LearningThemeId[];
  /** 유료 콘텐츠 썸네일 Storage 전체 경로 */
  thumbnailPath?: string | null;
  /** 상세·카드 조회 시 증가 */
  clickCount?: number;
  purchaseLink: string | null;
  /** Set when type is homework — unique code shown to students */
  homeworkCode: string | null;
  /** 안내용 4자리 숫자 (신규 등록부터, 학생 조회·URL에 사용 가능) */
  shortCode?: string | null;
  /** 과제 수행 가이드 및 주의사항 (homework only) */
  homeworkInstruction: string | null;
  /** 강의실에서 등록된 경우 해당 강의실 문서 ID */
  classroomId?: string | null;
  createdAt: unknown;
}

export interface HomeworkCodeDocument {
  contentId: string;
  homeworkCode: string;
  /** 학생·선생님 안내용 4자리 숫자 (신규 등록부터) */
  shortCode?: string;
  subject: string;
  learningTopic: string;
  introduction: string;
  homeworkInstruction: string;
  lectureLink: string | null;
  learningMaterialFilePaths: string[];
  referenceMaterialFilePaths: string[];
  authorId: string;
  /** contents.status 와 동기화 — 학생은 approved 만 조회 */
  status: ContentStatus;
  updatedAt: unknown;
}

export interface ContentQADocument {
  contentId: string;
  studentId: string;
  question: string;
  answer: string | null;
  createdAt: unknown;
  answeredAt: unknown | null;
}

export interface SubmissionDocument {
  contentId: string;
  studentId: string;
  teacherId: string;
  submissionText: string;
  submissionFiles: string[];
  score: number | null;
  feedback: string | null;
  submittedAt: unknown;
  updatedAt?: unknown;
}
