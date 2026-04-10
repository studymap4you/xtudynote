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
  purchaseLink: string | null;
  /** Set when type is homework — unique code shown to students */
  homeworkCode: string | null;
  /** 안내용 4자리 숫자 (신규 등록부터, 학생 조회·URL에 사용 가능) */
  shortCode?: string | null;
  /** 과제 수행 가이드 및 주의사항 (homework only) */
  homeworkInstruction: string | null;
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
