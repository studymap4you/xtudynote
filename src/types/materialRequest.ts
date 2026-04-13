import type { ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import type { UserRole } from "@/types/user";

export type MaterialRequestStatus = "pending" | "approved" | "rejected";

export interface MaterialRequestDocument {
  /** 제출자 UID (학생·교사·관리자 공통) */
  submitterId: string;
  submitterRole: Extract<UserRole, "student" | "teacher" | "super_admin">;
  /** 레거시 호환 */
  studentId?: string;
  title: string;
  materialType: ContentType;
  subject: string;
  audienceGrade: string;
  section?: string;
  description: string;
  /** 유료일 때만 (원) */
  desiredPrice: number | null;
  /** 과제 유형일 때만 */
  homeworkInstruction: string | null;
  learningMaterialFilePaths: string[];
  referenceMaterialFilePaths: string[];
  /** 테마 분류 */
  themes?: LearningThemeId[];
  /** 유료 썸네일 — 승인 시 contents로 복사 */
  thumbnailPendingPath?: string | null;
  status: MaterialRequestStatus;
  /** 강의실 연동 시 */
  classroomId?: string | null;
  createdAt: unknown;
  /** 마스터 승인 후 생성된 contents 문서 ID */
  resolvedContentId?: string | null;
  reviewedAt?: unknown;
}
